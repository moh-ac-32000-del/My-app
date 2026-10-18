import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { closingCashBalances } from './closingCashBalances.js';

type JournalEvent = {
  id: string;
  storeId: string;
  type: 'cash_in' | 'cash_out' | 'debt' | 'settlement';
  amount: number;
  currency: string;
  customerId?: string;
  customerName?: string;
  note?: string;
  occurredAt: string;
  sourceId: string;
};

type CloudPaymentRecord = {
  id: string;
  direction?: unknown;
  transactionId?: unknown;
  customerId?: unknown;
  amount?: { amount?: unknown; currency?: unknown };
  paidAt?: unknown;
  note?: unknown;
};

type ArchiveRecord = {
  id: string;
  storeId: string;
  date: string;
  closedAt: string;
  closingNumber: number;
  snapshot: JournalEvent[];
  workspaceId: string;
  closingCashBalances?: Array<{ currency: string; amount: number }>;
};

type ArchiveRequest = {
  action: 'list' | 'close';
  spaceId: string;
  storeId: string;
  date?: string;
  startAt?: string;
  endAt?: string;
};

export interface DailyArchiveRuntime {
  firestore: Firestore;
  now: () => string;
}

export async function dailyArchiveCommandHandler(
  request: CallableRequest<ArchiveRequest>,
  runtime: DailyArchiveRuntime,
): Promise<{ archives: ArchiveRecord[]; created?: ArchiveRecord; processedAt: string }> {
  const uid = request.auth?.uid?.trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Firebase Auth is required');
  const input = validateRequest(request.data);
  const db = runtime.firestore;
  const spaceRef = db.collection('spaces').doc(input.spaceId);
  const [space, member, profile] = await Promise.all([
    spaceRef.get(),
    spaceRef.collection('members').doc(uid).get(),
    spaceRef.collection('storeProfile').doc('profile').get(),
  ]);
  if (!space.exists || space.data()?.status !== 'active') {
    throw new HttpsError('failed-precondition', 'Workspace is unavailable');
  }
  if (!member.exists || member.data()?.status !== 'active') {
    throw new HttpsError('permission-denied', 'Active workspace membership is required');
  }
  if (!profile.exists || profile.data()?.storeId !== input.storeId) {
    throw new HttpsError('permission-denied', 'Store profile does not match workspace');
  }

  const archivesRef = spaceRef.collection('dailyArchives');
  if (input.action === 'list') {
    const snapshot = await archivesRef.where('storeId', '==', input.storeId).get();
    const archives = snapshot.docs
      .map((doc) => normalizeArchive(doc.id, doc.data(), input.spaceId, input.storeId))
      .filter((archive): archive is ArchiveRecord => archive !== null)
      .sort((a, b) => b.date.localeCompare(a.date) || b.closingNumber - a.closingNumber);
    return { archives, processedAt: runtime.now() };
  }

  const date = input.date!;
  const startAt = input.startAt!;
  const endAt = input.endAt!;
  const counterRef = spaceRef.collection('dailyClosingCounters').doc(`${input.storeId}_${date}`);
  const created = await db.runTransaction(async (tx) => {
    const [transactionSnap, debtSnap, paymentSnap, existingArchives, counterSnap, cashSnapshot] = await Promise.all([
      tx.get(spaceRef.collection('transactions').where('storeId', '==', input.storeId).where('createdAt', '>=', startAt).where('createdAt', '<', endAt)),
      tx.get(spaceRef.collection('debts').where('storeId', '==', input.storeId).where('createdAt', '>=', startAt).where('createdAt', '<', endAt)),
      tx.get(spaceRef.collection('payments').where('storeId', '==', input.storeId).where('paidAt', '>=', startAt).where('paidAt', '<', endAt)),
      tx.get(archivesRef.where('storeId', '==', input.storeId).where('date', '==', date)),
      tx.get(counterRef),
      // All dates, canonical store only. All journal and balance reads share the
      // archive transaction; a retry refreshes both rather than mixing snapshots.
      tx.get(spaceRef.collection('transactions').where('storeId', '==', input.storeId)),
    ]);

    const payments: CloudPaymentRecord[] = paymentSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<CloudPaymentRecord, 'id'>),
    }));
    const customerIds = new Set<string>();
    for (const doc of debtSnap.docs) {
      const customerId = doc.data().customerId;
      if (typeof customerId === 'string' && customerId.trim()) customerIds.add(customerId);
    }
    for (const payment of payments) {
      if (typeof payment.customerId === 'string' && payment.customerId.trim()) customerIds.add(payment.customerId);
    }
    const customerDocs = await Promise.all([...customerIds].map((id) => tx.get(spaceRef.collection('customers').doc(id))));
    const customers = new Map(customerDocs.flatMap((doc) => {
      const name = doc.data()?.name;
      return doc.exists && typeof name === 'string' ? [[doc.id, name] as const] : [];
    }));
    const settlementTransactionIds = new Set(
      payments.filter((payment) => payment.direction === 'in' && typeof payment.transactionId === 'string')
        .map((payment) => payment.transactionId as string),
    );
    const alreadyArchivedIds = new Set(
      existingArchives.docs.flatMap((doc) => {
        const data = doc.data();
        return Array.isArray(data.snapshot)
          ? data.snapshot.filter((event) => event && typeof event.id === 'string').map((event) => event.id as string)
          : [];
      }),
    );
    const events: JournalEvent[] = [];
    for (const doc of transactionSnap.docs) {
      const value = doc.data();
      if (settlementTransactionIds.has(doc.id) || alreadyArchivedIds.has(`transaction:${doc.id}`)) continue;
      events.push({
        id: `transaction:${doc.id}`, storeId: input.storeId,
        type: value.type, amount: value.amount, currency: value.currency,
        ...(typeof value.note === 'string' && value.note ? { note: value.note } : {}),
        occurredAt: value.createdAt, sourceId: doc.id,
      } as JournalEvent);
    }
    for (const doc of debtSnap.docs) {
      const value = doc.data();
      if (alreadyArchivedIds.has(`debt:${doc.id}`)) continue;
      events.push({
        id: `debt:${doc.id}`, storeId: input.storeId, type: 'debt',
        amount: typeof value.originalAmount === 'number' ? value.originalAmount : value.amount,
        currency: value.currency, customerId: value.customerId,
        customerName: customers.get(value.customerId),
        occurredAt: value.createdAt, sourceId: doc.id,
      } as JournalEvent);
    }
    for (const payment of payments) {
      if (payment.direction !== 'in' || typeof payment.customerId !== 'string'
        || alreadyArchivedIds.has(`settlement:${payment.id}`)) continue;
      events.push({
        id: `settlement:${payment.id}`, storeId: input.storeId, type: 'settlement',
        amount: payment.amount?.amount, currency: payment.amount?.currency,
        customerId: payment.customerId, customerName: customers.get(payment.customerId),
        ...(typeof payment.note === 'string' && payment.note ? { note: payment.note } : {}),
        occurredAt: payment.paidAt, sourceId: payment.id,
      } as JournalEvent);
    }
    events.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
    const balances = closingCashBalances(cashSnapshot.docs.map((doc) => doc.data()));
    const now = runtime.now();
    const closingNumber = (typeof counterSnap.data()?.lastClosingNumber === 'number'
      ? counterSnap.data()!.lastClosingNumber : 0) + 1;
    const id = `${date}_${String(closingNumber).padStart(6, '0')}`;
    const archive: ArchiveRecord = {
      id, storeId: input.storeId, workspaceId: input.spaceId, date,
      closedAt: now, closingNumber, snapshot: events, closingCashBalances: balances,
    };
    tx.set(counterRef, { storeId: input.storeId, date, lastClosingNumber: closingNumber, updatedAt: now });
    tx.create(archivesRef.doc(id), archive);
    return archive;
  });
  return { archives: [created], created, processedAt: created.closedAt };
}

export function createDailyArchiveRuntime(firestore: Firestore): DailyArchiveRuntime {
  return { firestore, now: () => new Date().toISOString() };
}

function validateRequest(value: unknown): ArchiveRequest {
  if (!isRecord(value) || !['list', 'close'].includes(String(value.action))
    || !validId(value.spaceId) || !validId(value.storeId)) {
    throw new HttpsError('invalid-argument', 'Archive command is invalid');
  }
  const input = value as unknown as ArchiveRequest;
  if (input.action === 'close') {
    if (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)
      || !validTimestamp(input.startAt) || !validTimestamp(input.endAt)
      || Date.parse(input.startAt!) >= Date.parse(input.endAt!)
      || Date.parse(input.endAt!) - Date.parse(input.startAt!) < 20 * 60 * 60 * 1000
      || Date.parse(input.endAt!) - Date.parse(input.startAt!) > 28 * 60 * 60 * 1000) {
      throw new HttpsError('invalid-argument', 'Archive date range is invalid');
    }
  }
  return { ...input, spaceId: input.spaceId.trim(), storeId: input.storeId.trim() };
}

function normalizeArchive(id: string, value: unknown, spaceId: string, storeId: string): ArchiveRecord | null {
  if (!isRecord(value) || value.id !== id || value.workspaceId !== spaceId || value.storeId !== storeId
    || typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)
    || typeof value.closedAt !== 'string' || !Number.isFinite(Date.parse(value.closedAt))
    || typeof value.closingNumber !== 'number' || !Number.isInteger(value.closingNumber)
    || !Array.isArray(value.snapshot)) return null;
  return value as unknown as ArchiveRecord;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200 && !value.includes('/');
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && value.length <= 50;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
