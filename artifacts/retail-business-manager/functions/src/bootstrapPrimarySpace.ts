import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type {
  BootstrapPrimarySpaceRequest,
  BootstrapPrimarySpaceResponse,
} from '../../types/trustedBootstrap';
import type { OwnerMembership, Space } from '../../types/space';

const USERS_COLLECTION = 'users';
const SPACES_COLLECTION = 'spaces';
const MEMBERS_COLLECTION = 'members';
const MEMBERSHIPS_COLLECTION = 'memberships';
const OPERATION_RECEIPTS_COLLECTION = 'operationReceipts';
const PRIMARY_SPACE_NAME = 'Primary Space';
const BOOTSTRAP_OPERATION_PREFIX = 'bootstrap:';

export interface BootstrapRuntime {
  firestore: Firestore;
  serverTimestamp: () => FieldValue;
}

interface BootstrapTransactionResult {
  outcome: BootstrapPrimarySpaceResponse['outcome'];
  spaceId: string;
}

export async function bootstrapPrimarySpaceHandler(
  request: CallableRequest<BootstrapPrimarySpaceRequest>,
  runtime: BootstrapRuntime,
): Promise<BootstrapPrimarySpaceResponse> {
  assertAuthenticated(request.auth);
  assertEmptyRequest(request.data);

  const uid = request.auth.uid;
  const operationId = `${BOOTSTRAP_OPERATION_PREFIX}${uid}`;

  let transactionResult: BootstrapTransactionResult;
  try {
    transactionResult = await runtime.firestore.runTransaction(async (transaction) => {
      const userReference = runtime.firestore.collection(USERS_COLLECTION).doc(uid);
      const userSnapshot = await transaction.get(userReference);
      const userData = userSnapshot.exists ? userSnapshot.data() ?? {} : {};
      const existingPrimarySpaceId = getPrimarySpaceId(userData);

      if (!existingPrimarySpaceId) {
        const spaceReference = runtime.firestore.collection(SPACES_COLLECTION).doc();
        const membershipReference = spaceReference.collection(MEMBERS_COLLECTION).doc(uid);
        const membershipIndexReference = userReference
          .collection(MEMBERSHIPS_COLLECTION)
          .doc(spaceReference.id);
        const receiptReference = runtime.firestore
          .collection(OPERATION_RECEIPTS_COLLECTION)
          .doc(operationId);
        const now = runtime.serverTimestamp();

        transaction.create(spaceReference, {
          spaceId: spaceReference.id,
          name: PRIMARY_SPACE_NAME,
          mode: 'private',
          status: 'active',
          ownerUserId: uid,
          createdAt: now,
          updatedAt: now,
        });
        transaction.create(membershipReference, {
          spaceId: spaceReference.id,
          userId: uid,
          role: 'owner',
          status: 'active',
          createdAt: now,
          updatedAt: now,
          joinedAt: now,
        });
        transaction.create(membershipIndexReference, {
          spaceId: spaceReference.id,
          role: 'owner',
          status: 'active',
          spaceNameSnapshot: PRIMARY_SPACE_NAME,
          joinedAt: now,
          updatedAt: now,
        });
        transaction.create(receiptReference, {
          operationId,
          spaceId: spaceReference.id,
          status: 'completed',
          processedAt: now,
          result: { primarySpaceId: spaceReference.id },
        });
        transaction.set(userReference, {
          primarySpaceId: spaceReference.id,
          createdAt: now,
          updatedAt: now,
        }, { merge: true });

        return {
          outcome: 'created',
          spaceId: spaceReference.id,
        };
      }

      const spaceReference = runtime.firestore.collection(SPACES_COLLECTION).doc(existingPrimarySpaceId);
      const membershipReference = spaceReference.collection(MEMBERS_COLLECTION).doc(uid);
      const membershipIndexReference = userReference
        .collection(MEMBERSHIPS_COLLECTION)
        .doc(existingPrimarySpaceId);
      const receiptReference = runtime.firestore
        .collection(OPERATION_RECEIPTS_COLLECTION)
        .doc(operationId);
      const [spaceSnapshot, membershipSnapshot, membershipIndexSnapshot, receiptSnapshot] = await transaction.getAll(
        spaceReference,
        membershipReference,
        membershipIndexReference,
        receiptReference,
      );

      assertSpaceOwnership(spaceSnapshot.data(), existingPrimarySpaceId, uid);
      const spaceData = spaceSnapshot.data() ?? {};
      const membershipData = membershipSnapshot.data();
      const membershipIndexData = membershipIndexSnapshot.data();
      const receiptData = receiptSnapshot.data();
      let repaired = false;

      if (membershipSnapshot.exists) {
        assertOwnerMembership(membershipData, existingPrimarySpaceId, uid);
      } else {
        repaired = true;
        const now = runtime.serverTimestamp();
        transaction.create(membershipReference, {
          spaceId: existingPrimarySpaceId,
          userId: uid,
          role: 'owner',
          status: 'active',
          createdAt: now,
          updatedAt: now,
          joinedAt: now,
        });
      }

      if (membershipIndexSnapshot.exists) {
        assertMembershipIndex(membershipIndexData, existingPrimarySpaceId);
      } else {
        repaired = true;
        const now = runtime.serverTimestamp();
        transaction.create(membershipIndexReference, {
          spaceId: existingPrimarySpaceId,
          role: 'owner',
          status: 'active',
          spaceNameSnapshot: requireString(spaceData.name, 'Space name is invalid'),
          joinedAt: now,
          updatedAt: now,
        });
      }

      if (receiptSnapshot.exists) {
        assertReceipt(receiptData, operationId, existingPrimarySpaceId);
      } else {
        repaired = true;
        const now = runtime.serverTimestamp();
        transaction.create(receiptReference, {
          operationId,
          spaceId: existingPrimarySpaceId,
          status: 'completed',
          processedAt: now,
          result: { primarySpaceId: existingPrimarySpaceId },
        });
      }

      return {
        outcome: repaired ? 'repaired' : 'existing',
        spaceId: existingPrimarySpaceId,
      };
    });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    if (isFirestoreConflict(error)) {
      throw new HttpsError('aborted', 'Bootstrap transaction conflicted', {
        code: 'CONFLICT',
      });
    }
    console.error('bootstrapPrimarySpace failed', error);
    throw new HttpsError('internal', 'Bootstrap failed', {
      code: 'INTERNAL',
    });
  }

  return readBootstrapResponse(runtime.firestore, uid, transactionResult, operationId);
}

export function createDefaultBootstrapRuntime(firestore: Firestore): BootstrapRuntime {
  return {
    firestore,
    serverTimestamp: () => FieldValue.serverTimestamp(),
  };
}

function assertAuthenticated(
  auth: CallableRequest<BootstrapPrimarySpaceRequest>['auth'],
): asserts auth is NonNullable<CallableRequest<BootstrapPrimarySpaceRequest>['auth']> {
  if (!auth || typeof auth.uid !== 'string' || auth.uid.trim().length === 0) {
    throw new HttpsError('unauthenticated', 'Firebase Auth is required', {
      code: 'UNAUTHENTICATED',
    });
  }
}

function assertEmptyRequest(data: unknown): asserts data is BootstrapPrimarySpaceRequest {
  if (data === undefined || data === null) {
    return;
  }
  if (typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length > 0) {
    throw new HttpsError('invalid-argument', 'Bootstrap does not accept client fields', {
      code: 'INVALID_ARGUMENT',
    });
  }
}

function getPrimarySpaceId(userData: DocumentData): string | null {
  if (!Object.prototype.hasOwnProperty.call(userData, 'primarySpaceId')) {
    return null;
  }
  if (typeof userData.primarySpaceId !== 'string' || userData.primarySpaceId.trim().length === 0) {
    throw new HttpsError('failed-precondition', 'Primary Space reference is invalid', {
      code: 'CONFLICT',
    });
  }
  return userData.primarySpaceId;
}

function assertSpaceOwnership(data: DocumentData | undefined, expectedSpaceId: string, uid: string): asserts data is DocumentData {
  if (!data) {
    throw new HttpsError('not-found', 'Primary Space was not found', {
      code: 'SPACE_NOT_FOUND',
    });
  }
  if (
    data.spaceId !== expectedSpaceId
    || data.ownerUserId !== uid
    || data.status !== 'active'
  ) {
    throw new HttpsError('failed-precondition', 'Primary Space ownership is inconsistent', {
      code: 'CONFLICT',
    });
  }
}

function assertOwnerMembership(
  data: DocumentData | undefined,
  expectedSpaceId: string,
  uid: string,
): asserts data is DocumentData {
  if (!data) {
    throw new HttpsError('not-found', 'Owner Membership was not found', {
      code: 'MEMBERSHIP_NOT_FOUND',
    });
  }
  if (
    data.spaceId !== expectedSpaceId
    || data.userId !== uid
    || data.role !== 'owner'
    || data.status !== 'active'
  ) {
    throw new HttpsError('failed-precondition', 'Owner Membership is inconsistent', {
      code: 'CONFLICT',
    });
  }
}

function assertMembershipIndex(data: DocumentData | undefined, expectedSpaceId: string): void {
  if (!data) {
    throw new HttpsError('not-found', 'Membership index was not found', {
      code: 'MEMBERSHIP_NOT_FOUND',
    });
  }
  if (
    data.spaceId !== expectedSpaceId
    || data.role !== 'owner'
    || data.status !== 'active'
  ) {
    throw new HttpsError('failed-precondition', 'Membership index is inconsistent', {
      code: 'CONFLICT',
    });
  }
}

function assertReceipt(
  data: DocumentData | undefined,
  operationId: string,
  expectedSpaceId: string,
): asserts data is DocumentData {
  if (!data) {
    throw new HttpsError('failed-precondition', 'Operation receipt is missing', {
      code: 'CONFLICT',
    });
  }
  if (
    data.operationId !== operationId
    || data.spaceId !== expectedSpaceId
    || data.status !== 'completed'
  ) {
    throw new HttpsError('failed-precondition', 'Operation receipt is inconsistent', {
      code: 'CONFLICT',
    });
  }
}

async function readBootstrapResponse(
  firestore: Firestore,
  uid: string,
  transactionResult: BootstrapTransactionResult,
  operationId: string,
): Promise<BootstrapPrimarySpaceResponse> {
  const userReference = firestore.collection(USERS_COLLECTION).doc(uid);
  const spaceReference = firestore.collection(SPACES_COLLECTION).doc(transactionResult.spaceId);
  const membershipReference = spaceReference.collection(MEMBERS_COLLECTION).doc(uid);
  const receiptReference = firestore.collection(OPERATION_RECEIPTS_COLLECTION).doc(operationId);
  const [spaceSnapshot, membershipSnapshot, receiptSnapshot] = await firestore.getAll(
    spaceReference,
    membershipReference,
    receiptReference,
  );

  const space = toSpace(spaceSnapshot.data(), transactionResult.spaceId);
  const ownerMembership = toOwnerMembership(
    membershipSnapshot.data(),
    transactionResult.spaceId,
    uid,
  );
  const operationReceipt = toOperationReceipt(
    receiptSnapshot.data(),
    operationId,
    transactionResult.spaceId,
  );

  // Reading the user document after commit confirms that the primary marker was
  // committed with the provisioning write set.
  const userSnapshot = await firestore.getAll(userReference);
  if (!userSnapshot[0].exists || userSnapshot[0].data()?.primarySpaceId !== transactionResult.spaceId) {
    throw new HttpsError('internal', 'Primary Space marker was not committed', {
      code: 'INTERNAL',
    });
  }

  return {
    outcome: transactionResult.outcome,
    primarySpaceId: transactionResult.spaceId,
    space,
    ownerMembership,
    operationReceipt,
  };
}

function toSpace(data: DocumentData | undefined, expectedSpaceId: string): Space {
  if (!data) {
    throw new HttpsError('not-found', 'Primary Space was not found', {
      code: 'SPACE_NOT_FOUND',
    });
  }
  const spaceId = requireString(data.spaceId, 'Space ID is invalid');
  if (spaceId !== expectedSpaceId) {
    throw new HttpsError('internal', 'Space ID does not match its document', {
      code: 'INTERNAL',
    });
  }
  return {
    spaceId,
    name: requireString(data.name, 'Space name is invalid'),
    mode: requireSpaceMode(data.mode),
    status: requireSpaceStatus(data.status),
    ownerUserId: requireString(data.ownerUserId, 'Space owner is invalid'),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

function toOwnerMembership(
  data: DocumentData | undefined,
  expectedSpaceId: string,
  uid: string,
): OwnerMembership {
  assertOwnerMembership(data, expectedSpaceId, uid);
  return {
    spaceId: expectedSpaceId,
    userId: uid,
    role: 'owner',
    status: 'active',
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    ...(data.joinedAt === undefined ? {} : { joinedAt: timestampToIso(data.joinedAt) }),
  };
}

function toOperationReceipt(
  data: DocumentData | undefined,
  operationId: string,
  expectedSpaceId: string,
) {
  assertReceipt(data, operationId, expectedSpaceId);
  return {
    operationId,
    spaceId: expectedSpaceId,
    status: 'completed' as const,
    processedAt: timestampToIso(data.processedAt),
    result: data.result,
  };
}

function requireSpaceMode(value: unknown): Space['mode'] {
  if (value !== 'private' && value !== 'shared') {
    throw new HttpsError('internal', 'Space mode is invalid', { code: 'INTERNAL' });
  }
  return value;
}

function requireSpaceStatus(value: unknown): Space['status'] {
  if (value !== 'active' && value !== 'suspended' && value !== 'archived') {
    throw new HttpsError('internal', 'Space status is invalid', { code: 'INTERNAL' });
  }
  return value;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpsError('internal', message, { code: 'INTERNAL' });
  }
  return value;
}

function timestampToIso(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  throw new HttpsError('internal', 'Server timestamp is invalid', {
    code: 'INTERNAL',
  });
}

function isFirestoreConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false;
  }
  return error.code === 10 || error.code === 'aborted';
}