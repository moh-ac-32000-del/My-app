import { describe, expect, it } from 'vitest';
import {
  bootstrapPrimarySpaceHandler,
  type BootstrapRuntime,
} from '@/functions/src/bootstrapPrimarySpace';

interface StoredDocument {
  [key: string]: unknown;
}

class FakeDocumentSnapshot {
  constructor(private readonly value: StoredDocument | undefined) {}

  get exists(): boolean {
    return this.value !== undefined;
  }

  data(): StoredDocument | undefined {
    return this.value;
  }
}

class FakeDocumentReference {
  constructor(
    readonly firestore: FakeFirestore,
    readonly path: string,
    readonly id: string,
  ) {}

  collection(name: string): FakeCollectionReference {
    return new FakeCollectionReference(this.firestore, `${this.path}/${name}`);
  }
}

class FakeCollectionReference {
  constructor(
    private readonly firestore: FakeFirestore,
    private readonly path: string,
  ) {}

  doc(id?: string): FakeDocumentReference {
    const documentId = id ?? this.firestore.nextGeneratedId();
    return new FakeDocumentReference(this.firestore, `${this.path}/${documentId}`, documentId);
  }
}

class FakeTransaction {
  private readonly pendingCreates = new Map<string, StoredDocument>();
  private readonly pendingSets = new Map<string, { value: StoredDocument; merge: boolean }>();

  constructor(private readonly firestore: FakeFirestore) {}

  async get(reference: FakeDocumentReference): Promise<FakeDocumentSnapshot> {
    return this.firestore.snapshot(reference.path);
  }

  async getAll(...references: FakeDocumentReference[]): Promise<FakeDocumentSnapshot[]> {
    return references.map((reference) => this.firestore.snapshot(reference.path));
  }

  create(reference: FakeDocumentReference, value: StoredDocument): void {
    if (
      this.firestore.has(reference.path)
      || this.pendingCreates.has(reference.path)
      || this.pendingSets.has(reference.path)
    ) {
      throw Object.assign(new Error('already-exists'), { code: 6 });
    }
    this.pendingCreates.set(reference.path, { ...value });
  }

  set(
    reference: FakeDocumentReference,
    value: StoredDocument,
    options?: { merge?: boolean },
  ): void {
    this.pendingSets.set(reference.path, {
      value: { ...value },
      merge: options?.merge === true,
    });
  }

  commit(): void {
    for (const [path, value] of this.pendingCreates) {
      this.firestore.write(path, value);
    }
    for (const [path, pending] of this.pendingSets) {
      const current = pending.merge ? this.firestore.read(path) ?? {} : {};
      this.firestore.write(path, { ...current, ...pending.value });
    }
  }
}

class FakeFirestore {
  private readonly documents = new Map<string, StoredDocument>();
  private transactionQueue: Promise<void> = Promise.resolve();
  private generatedIdSequence = 0;

  collection(name: string): FakeCollectionReference {
    return new FakeCollectionReference(this, name);
  }

  async runTransaction<T>(callback: (transaction: FakeTransaction) => Promise<T>): Promise<T> {
    let releaseQueue: () => void = () => undefined;
    const previous = this.transactionQueue;
    this.transactionQueue = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    await previous;

    try {
      const transaction = new FakeTransaction(this);
      const result = await callback(transaction);
      transaction.commit();
      return result;
    } finally {
      releaseQueue();
    }
  }

  async getAll(...references: FakeDocumentReference[]): Promise<FakeDocumentSnapshot[]> {
    return references.map((reference) => this.snapshot(reference.path));
  }

  nextGeneratedId(): string {
    this.generatedIdSequence += 1;
    return `space-generated-${this.generatedIdSequence}`;
  }

  snapshot(path: string): FakeDocumentSnapshot {
    return new FakeDocumentSnapshot(this.read(path));
  }

  has(path: string): boolean {
    return this.documents.has(path);
  }

  read(path: string): StoredDocument | undefined {
    const value = this.documents.get(path);
    return value ? { ...value } : undefined;
  }

  write(path: string, value: StoredDocument): void {
    this.documents.set(path, { ...value });
  }

  paths(): string[] {
    return Array.from(this.documents.keys()).sort();
  }
}

function createRuntime(): { firestore: FakeFirestore; runtime: BootstrapRuntime } {
  const firestore = new FakeFirestore();
  const timestamp = {
    toDate: () => new Date('2026-08-30T10:00:00.000Z'),
  } as unknown as ReturnType<BootstrapRuntime['serverTimestamp']>;
  return {
    firestore,
    runtime: {
      firestore: firestore as unknown as BootstrapRuntime['firestore'],
      serverTimestamp: () => timestamp,
    },
  };
}

function request(uid: string | null, data: unknown = {}) {
  return {
    auth: uid ? { uid } : null,
    data,
  } as never;
}

describe('bootstrapPrimarySpace Cloud Function handler', () => {
  it('creates the Space, owner Membership, discovery index, and receipt atomically', async () => {
    const { firestore, runtime } = createRuntime();

    const response = await bootstrapPrimarySpaceHandler(
      request('firebase-user-contract'),
      runtime,
    );

    expect(response.outcome).toBe('created');
    expect(response.primarySpaceId).toBe('space-generated-1');
    expect(response.space.ownerUserId).toBe('firebase-user-contract');
    expect(response.ownerMembership).toMatchObject({
      userId: 'firebase-user-contract',
      role: 'owner',
      status: 'active',
    });
    expect(firestore.paths()).toEqual([
      'operationReceipts/bootstrap:firebase-user-contract',
      'spaces/space-generated-1',
      'spaces/space-generated-1/members/firebase-user-contract',
      'users/firebase-user-contract',
      'users/firebase-user-contract/memberships/space-generated-1',
    ]);
  });

  it('returns the existing primary Space on repeated login', async () => {
    const { firestore, runtime } = createRuntime();
    const first = await bootstrapPrimarySpaceHandler(request('firebase-user-contract'), runtime);
    const second = await bootstrapPrimarySpaceHandler(request('firebase-user-contract'), runtime);

    expect(first.outcome).toBe('created');
    expect(second.outcome).toBe('existing');
    expect(second.primarySpaceId).toBe(first.primarySpaceId);
    expect(firestore.paths().filter((path) => /^spaces\/[^/]+$/.test(path))).toHaveLength(1);
  });

  it('creates one primary Space when two devices bootstrap concurrently', async () => {
    const { firestore, runtime } = createRuntime();

    const responses = await Promise.all([
      bootstrapPrimarySpaceHandler(request('firebase-user-contract'), runtime),
      bootstrapPrimarySpaceHandler(request('firebase-user-contract'), runtime),
    ]);

    expect(responses.map((response) => response.outcome).sort()).toEqual(['created', 'existing']);
    expect(new Set(responses.map((response) => response.primarySpaceId))).toEqual(
      new Set(['space-generated-1']),
    );
    expect(firestore.paths().filter((path) => /^spaces\/[^/]+$/.test(path))).toHaveLength(1);
  });

  it('rejects unauthenticated calls and every client-controlled identity field', async () => {
    const { runtime } = createRuntime();

    await expect(
      bootstrapPrimarySpaceHandler(request(null), runtime),
    ).rejects.toMatchObject({
      details: { code: 'UNAUTHENTICATED' },
    });
    await expect(
      bootstrapPrimarySpaceHandler(request('firebase-user-contract', {
        uid: 'another-user',
        spaceId: 'chosen-space',
        ownerUserId: 'another-user',
        role: 'owner',
      }), runtime),
    ).rejects.toMatchObject({
      details: { code: 'INVALID_ARGUMENT' },
    });
  });
});