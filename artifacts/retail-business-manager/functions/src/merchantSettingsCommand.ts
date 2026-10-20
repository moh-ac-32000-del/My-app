import { createHash } from 'node:crypto';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { MerchantRuntime } from './merchantCommand.js';
import { assertWorkspaceAccess } from './workspaceAccess.js';
import { validateMerchantSettings } from '../../data/merchantSettings.js';

export async function merchantSettingsCommandHandler(request: CallableRequest<unknown>, runtime: MerchantRuntime) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication required');
  const raw = request.data as Record<string, unknown>;
  const validId = (value: unknown): value is string =>
    typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
  if (
    !raw ||
    !validId(raw.spaceId) ||
    !validId(raw.storeId) ||
    !validId(raw.operationId) ||
    Object.keys(raw).some((key) => !['spaceId', 'storeId', 'operationId', 'settings'].includes(key))
  )
    throw new HttpsError('invalid-argument', 'Invalid settings request');
  let settings;
  try {
    settings = validateMerchantSettings(raw.settings);
  } catch {
    throw new HttpsError('invalid-argument', 'Invalid reference lists');
  }
  const input = { spaceId: raw.spaceId, storeId: raw.storeId, operationId: raw.operationId, settings };
  const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const space = runtime.firestore.collection('spaces').doc(input.spaceId);
  const ref = space.collection('merchantSettings').doc('config');
  const receipt = space.collection('operationReceipts').doc(input.operationId);
  return runtime.firestore.runTransaction(async (tx) => {
    const spaceSnap = await tx.get(space);
    const member = await tx.get(space.collection('members').doc(uid));
    const profile = await tx.get(space.collection('storeProfile').doc('profile'));
    const priorReceipt = await tx.get(receipt);
    const current = await tx.get(ref);
    if (spaceSnap.data()?.status !== 'active') throw new HttpsError('failed-precondition', 'Workspace unavailable');
    assertWorkspaceAccess(member.data(), 'write');
    if (profile.data()?.storeId !== input.storeId) throw new HttpsError('permission-denied', 'Store mismatch');
    if (priorReceipt.exists) {
      const prior = priorReceipt.data();
      if (
        prior?.command !== 'merchantSettingsCommand' ||
        prior.actorUserId !== uid ||
        prior.payloadDigest !== digest ||
        prior.spaceId !== input.spaceId ||
        prior.status !== 'completed'
      )
        throw new HttpsError('already-exists', 'Operation ID conflict');
      return { ...prior.result, outcome: 'replayed' };
    }
    const record = current.data();
    let revision = 0;
    if (current.exists) {
      if (record?.workspaceId !== input.spaceId || record.storeId !== input.storeId || record.version !== 1)
        throw new HttpsError('data-loss', 'Invalid settings scope');
      try {
        revision = validateMerchantSettings(record).revision;
      } catch {
        throw new HttpsError('data-loss', 'Invalid settings');
      }
    }
    if (revision !== settings.revision) throw new HttpsError('aborted', 'Settings changed; reload before saving');
    const now = runtime.now();
    const result = { outcome: 'updated', operationId: input.operationId, revision: revision + 1, processedAt: now };
    tx.set(ref, {
      ...settings,
      revision: revision + 1,
      workspaceId: input.spaceId,
      storeId: input.storeId,
      version: 1,
      updatedAt: now,
      updatedByUserId: uid,
    });
    tx.create(receipt, {
      command: 'merchantSettingsCommand',
      spaceId: input.spaceId,
      operationId: input.operationId,
      actorUserId: uid,
      payloadDigest: digest,
      status: 'completed',
      processedAt: now,
      result,
    });
    return result;
  });
}
