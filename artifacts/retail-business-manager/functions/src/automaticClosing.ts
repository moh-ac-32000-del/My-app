import type { Firestore, Transaction, DocumentReference, QuerySnapshot } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  automaticClosingPolicy,
  financialWindow,
  nextClosingAt,
  type AutomaticClosingPolicy,
} from '../../data/automaticClosing.js';
import { closingSettings, workspaceDayBounds } from '../../data/workspaceClosing.js';
import { closingCashBalances } from './closingCashBalances.js';
import { projectArchiveSnapshot, type ArchiveRecord } from './dailyArchiveCommand.js';

const LIMIT = 500;
const MAX_SPACES = 3;
const pausedUntil = '9999-12-31T00:00:00.000Z';
const canonicalPostingDate = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const bounded = (snap: QuerySnapshot) => {
  if (snap.docs.length > LIMIT)
    throw new HttpsError('resource-exhausted', 'Closing period exceeds reviewed record limit');
  return snap;
};

/** Activation scans once, bounded, using the owner's confirmed legacy calendar. Never rewrites a source record. */
export async function prepareAutomaticClosing(
  tx: Transaction,
  spaceRef: DocumentReference,
  space: Record<string, any>,
  storeId: string,
  uid: string,
  now: string,
  legacyTimeZone: string,
): Promise<AutomaticClosingPolicy> {
  const snapshots = await Promise.all(
    ['transactions', 'debts', 'payments', 'merchantOperations', 'dailyArchives'].map((name) =>
      tx
        .get(
          spaceRef
            .collection(name)
            .where('storeId', '==', storeId)
            .limit(LIMIT + 1),
        )
        .then(bounded),
    ),
  );
  const [cash, debts, payments, merchant, archives] = snapshots;
  assertArchives(archives, spaceRef.id, storeId);
  const events = await projectArchiveSnapshot(
    tx,
    spaceRef,
    { spaceId: spaceRef.id, storeId },
    cash,
    debts,
    payments,
    merchant,
    archives,
  );
  for (const event of events) {
    if (!canonicalPostingDate(event.occurredAt) || event.occurredAt > now) {
      throw new HttpsError('failed-precondition', 'Legacy posting dates require review before activation');
    }
  }
  for (const doc of cash.docs) {
    if (
      !canonicalPostingDate(doc.data().createdAt) ||
      doc.data().createdAt > now
    ) {
      throw new HttpsError('failed-precondition', 'Legacy cash dates require review before activation');
    }
  }
  const earliest = events.map((event) => event.occurredAt).sort()[0] ?? now;
  const cursorAt = workspaceDayBounds(new Date(earliest), legacyTimeZone).startAt;
  const settings = closingSettings(space.closingSettings);
  return {
    version: 1,
    activatedAt: now,
    activatedByUserId: uid,
    legacyTimeZone,
    transitions: [
      {
        from: workspaceDayBounds(new Date(now), legacyTimeZone).endAt,
        timeZone: settings.timeZone,
        executionTime: settings.executionTime,
      },
    ],
    cursorAt,
    closedThrough: cursorAt,
    failures: 0,
    cashBalances: closingCashBalances(
      cash.docs.filter((doc) => doc.data().createdAt < cursorAt).map((doc) => doc.data()),
    ),
  };
}

function advanceBalances(previous: AutomaticClosingPolicy['cashBalances'], records: Record<string, any>[]) {
  // Same existing cash-only summation. Checkpoint is a trusted derived carry, never a cash movement.
  const result = closingCashBalances([
    ...previous
      .filter((balance) => balance.amount !== 0)
      .map((balance) => ({
        currency: balance.currency,
        amount: Math.abs(balance.amount),
        type: balance.amount > 0 ? 'cash_in' : 'cash_out',
      })),
    ...records,
  ]);
  for (const balance of previous)
    if (!result.some((row) => row.currency === balance.currency)) result.push({ ...balance });
  return result;
}

function assertArchives(archives: QuerySnapshot, spaceId: string, storeId: string) {
  for (const doc of archives.docs) {
    const row = doc.data();
    if (
      row.id !== doc.id ||
      row.workspaceId !== spaceId ||
      row.storeId !== storeId ||
      !Number.isSafeInteger(row.closingNumber) ||
      row.closingNumber < 1 ||
      !Array.isArray(row.snapshot) ||
      row.snapshot.some((event) => !event || typeof event.id !== 'string')
    ) {
      throw new HttpsError('failed-precondition', 'Legacy archives require review');
    }
  }
}

/** One eligible period, one atomic snapshot/checkpoint. All trusted writers read the same Space barrier. */
export async function closeAutomaticPeriod(
  runtime: { firestore: Firestore; now: () => string },
  spaceId: string,
): Promise<'closed' | 'empty' | 'not-due'> {
  const db = runtime.firestore;
  const spaceRef = db.collection('spaces').doc(spaceId);
  return db.runTransaction(async (tx) => {
    const now = runtime.now();
    const [spaceSnap, profile] = await Promise.all([
      tx.get(spaceRef),
      tx.get(spaceRef.collection('storeProfile').doc('profile')),
    ]);
    const space = spaceSnap.data();
    if (space?.status !== 'active' || !space.automaticClosing) return 'not-due';
    const policy = automaticClosingPolicy(space.automaticClosing);
    if (policy.failures >= 3 || space.autoClosingNextAt > now || nextClosingAt(policy) > now) return 'not-due';
    const storeId = profile.data()?.storeId;
    if (typeof storeId !== 'string' || !storeId)
      throw new HttpsError('failed-precondition', 'Canonical store is missing');
    const period = financialWindow(policy, new Date(policy.cursorAt));
    if (period.endAt > now || period.startAt !== policy.cursorAt) throw new Error('invalidClosingCursor');
    const archivesRef = spaceRef.collection('dailyArchives');
    const counterRef = spaceRef.collection('dailyClosingCounters').doc(`${storeId}_${period.date}`);
    const read = (name: string, field: string) =>
      tx
        .get(
          spaceRef
            .collection(name)
            .where('storeId', '==', storeId)
            .where(field, '>=', period.startAt)
            .where(field, '<', period.endAt)
            .limit(LIMIT + 1),
        )
        .then(bounded);
    const [cash, debts, payments, merchant, archives, counter] = await Promise.all([
      read('transactions', 'createdAt'),
      read('debts', 'createdAt'),
      read('payments', 'paidAt'),
      read('merchantOperations', 'createdAt'),
      tx
        .get(
          archivesRef
            .where('storeId', '==', storeId)
            .where('date', '==', period.date)
            .limit(LIMIT + 1),
        )
        .then(bounded),
      tx.get(counterRef),
    ]);
    assertArchives(archives, spaceId, storeId);
    const snapshot = await projectArchiveSnapshot(
      tx,
      spaceRef,
      { spaceId, storeId },
      cash,
      debts,
      payments,
      merchant,
      archives,
    );
    const cashBalances = advanceBalances(
      policy.cashBalances,
      cash.docs.map((doc) => doc.data()),
    );
    const next: AutomaticClosingPolicy = {
      ...policy,
      cursorAt: period.endAt,
      closedThrough: period.endAt,
      cashBalances,
      failures: 0,
    };
    delete next.lastErrorAt;
    if (snapshot.length) {
      const closingNumber =
        Math.max(counter.data()?.lastClosingNumber ?? 0, ...archives.docs.map((doc) => doc.data().closingNumber)) + 1;
      if (!Number.isSafeInteger(closingNumber) || closingNumber < 1) throw new Error('invalidClosingCounter');
      const id = `${period.date}_${String(closingNumber).padStart(6, '0')}`;
      const archive: ArchiveRecord = {
        id,
        workspaceId: spaceId,
        storeId,
        date: period.date,
        closingNumber,
        closedAt: now,
        closingMode: 'automatic',
        periodStartAt: period.startAt,
        periodEndAt: period.endAt,
        timeZone: period.timeZone,
        snapshot,
        closingCashBalances: cashBalances,
      };
      tx.create(archivesRef.doc(id), archive);
      tx.set(counterRef, { storeId, date: period.date, lastClosingNumber: closingNumber, updatedAt: now });
    }
    tx.update(spaceRef, { automaticClosing: next, autoClosingNextAt: nextClosingAt(next) });
    return snapshot.length ? 'closed' : 'empty';
  });
}

/** One shared five-minute schedule, bounded due query. Never poll every workspace or all financial history. */
export async function dispatchAutomaticClosings(runtime: { firestore: Firestore; now: () => string }) {
  const due = await runtime.firestore
    .collection('spaces')
    .where('status', '==', 'active')
    .where('autoClosingNextAt', '<=', runtime.now())
    .orderBy('autoClosingNextAt')
    .limit(MAX_SPACES)
    .get();
  const result = { inspected: due.docs.length, closed: 0, empty: 0, failed: 0 };
  for (const doc of due.docs) {
    try {
      const outcome = await closeAutomaticPeriod(runtime, doc.id);
      if (outcome === 'closed') result.closed++;
      if (outcome === 'empty') result.empty++;
    } catch {
      result.failed++;
      await runtime.firestore.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        const current = fresh.data();
        if (!current) return;
        if (!current.automaticClosing) {
          tx.update(doc.ref, { autoClosingNextAt: pausedUntil });
          return;
        }
        // A stale failing invocation cannot overwrite a newer successful checkpoint/configuration.
        if (
          current?.automaticClosing?.cursorAt !== doc.data().automaticClosing?.cursorAt ||
          current?.autoClosingNextAt !== doc.data().autoClosingNextAt
        )
          return;
        const failures = Math.min(3, (current.automaticClosing?.failures ?? 0) + 1);
        tx.update(doc.ref, {
          automaticClosing: { ...current.automaticClosing, failures, lastErrorAt: runtime.now() },
          autoClosingNextAt:
            failures === 3 ? pausedUntil : new Date(Date.parse(runtime.now()) + 5 * 60000).toISOString(),
        });
      });
    }
  }
  return result;
}
