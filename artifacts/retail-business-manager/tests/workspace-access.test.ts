import { describe, expect, it } from 'vitest';
import {
  activeWorkspaceRole,
  canReadWorkspace,
  canWriteWorkspace,
  canManageWorkspace,
  assessMembershipRoleTransition,
} from '@/data/workspaceAccess';
import { createCashTransactionHandler } from '../functions/src/createCashTransaction';
import { createPaymentHandler } from '../functions/src/createPayment';
import { trustedDebtCommandHandler } from '../functions/src/trustedDebtCommand';
import { settleCustomerDebtHandler } from '../functions/src/settleCustomerDebt';
import { dailyArchiveCommandHandler } from '../functions/src/dailyArchiveCommand';
import { reminderCommandHandler } from '../functions/src/reminderCommand';
import { storeProfileCommandHandler } from '../functions/src/storeProfileCommand';
import {
  workspaceBackend,
  workspaceTestProfile,
  workspaceTestTime as now,
} from './fixtures/workspaceBackend';

const scope = { spaceId: 's', storeId: 'store' };
const request = (data: Record<string, unknown>) =>
  ({
    auth: { uid: 'u' },
    data: { ...scope, ...data, role: 'owner', actorUid: 'u' },
  }) as never;
const mutations = [
  [
    'cash',
    createCashTransactionHandler,
    {
      operationId: 'op',
      transactionId: 't-new',
      type: 'cash_in',
      amount: 10,
      currency: 'TRY',
    },
  ],
  [
    'payment',
    createPaymentHandler,
    {
      operationId: 'op',
      paymentId: 'p-new',
      customerId: 'c',
      amount: { amount: 10, currency: 'TRY' },
      direction: 'in',
      method: 'cash',
      paidAt: now,
    },
  ],
  [
    'debt',
    trustedDebtCommandHandler,
    {
      action: 'create',
      operationId: 'op',
      debtId: 'd-new',
      customerId: 'c',
      amount: 10,
      currency: 'TRY',
    },
  ],
  [
    'settlement',
    settleCustomerDebtHandler,
    {
      operationId: 'op',
      transactionId: 't-new',
      paymentId: 'p-new',
      customerId: 'c',
      amount: 10,
      currency: 'TRY',
    },
  ],
  [
    'archive',
    dailyArchiveCommandHandler,
    {
      action: 'close',
      date: '2026-10-19',
      startAt: '2026-10-19T00:00:00Z',
      endAt: '2026-10-20T00:00:00Z',
    },
  ],
  [
    'reminder create',
    reminderCommandHandler,
    { action: 'create', reminder: { id: 'r-new', debtId: 'd', remindAt: now } },
  ],
  [
    'reminder status',
    reminderCommandHandler,
    { action: 'updateStatus', reminderId: 'r', status: 'completed' },
  ],
  [
    'reminder delete',
    reminderCommandHandler,
    { action: 'delete', reminderId: 'r' },
  ],
] as const;

describe('one owner/editor/viewer policy, no legacy auto-promotion', () => {
  it.each(['owner', 'editor', 'viewer'])(
    'recognizes active %s only',
    (role) => {
      const member = { role, status: 'active' };
      expect(activeWorkspaceRole(member)).toBe(role);
      expect(canReadWorkspace(member)).toBe(true);
      expect(canWriteWorkspace(member)).toBe(role !== 'viewer');
      expect(canReadWorkspace({ ...member, status: 'suspended' })).toBe(false);
    },
  );
  it.each(['admin', 'manager', 'cashier', 'OWNER', '', null, undefined])(
    'does not infer access for %j',
    (role) => {
      const member = { role, status: 'active' };
      expect(canReadWorkspace(member)).toBe(false);
      expect(canWriteWorkspace(member)).toBe(false);
      expect(
        assessMembershipRoleTransition(member, { ownerUserId: 'other' }, 'u'),
      ).toBe('review-required');
    },
  );
  it('protects the single canonical owner and flags inconsistent ownership for review', () => {
    const owner = { role: 'owner', status: 'active' };
    expect(canManageWorkspace(owner, { ownerUserId: 'u' }, 'u')).toBe(true);
    expect(canManageWorkspace(owner, { ownerUserId: 'other' }, 'u')).toBe(
      false,
    );
    expect(
      canManageWorkspace(
        { role: 'editor', status: 'active' },
        { ownerUserId: 'u' },
        'u',
      ),
    ).toBe(false);
    expect(
      assessMembershipRoleTransition(owner, { ownerUserId: 'u' }, 'u'),
    ).toBe('unchanged');
    expect(
      assessMembershipRoleTransition(
        { role: 'editor', status: 'active' },
        { ownerUserId: 'u' },
        'u',
      ),
    ).toBe('review-required');
  });
});

describe.each(mutations)(
  '%s trusted authorization boundary',
  (name, handler, payload) => {
    it.each(['viewer', 'admin', 'manager', 'cashier', undefined])(
      'denies canonical role %j despite a forged owner field in the request',
      async (role) => {
        const f = workspaceBackend(role === undefined ? null : role);
        await expect(
          handler(request(payload), f.runtime),
        ).rejects.toMatchObject({ code: 'permission-denied' });
        expect(f.writes).toEqual([]);
      },
    );
    it.each(['owner', 'editor'])(
      'allows %s without changing financial algorithms',
      async (role) => {
        const f = workspaceBackend(role);
        await handler(request(payload), f.runtime);
        expect(f.writes.length).toBeGreaterThan(0);
      },
    );
    it('revalidates the role on a transaction retry after downgrade, without committed writes', async () => {
      const f = workspaceBackend('editor');
      f.retryOnce(() => {
        f.docs['spaces/s/members/u'].role = 'viewer';
      });
      await expect(handler(request(payload), f.runtime)).rejects.toMatchObject({
        code: 'permission-denied',
      });
      expect(f.writes).toEqual([]);
    });
    it('rejects access after removal and never trusts a different workspace membership', async () => {
      const f = workspaceBackend('editor');
      f.docs['spaces/other/members/u'] = f.docs['spaces/s/members/u'];
      delete f.docs['spaces/s/members/u'];
      await expect(handler(request(payload), f.runtime)).rejects.toMatchObject({
        code: 'permission-denied',
      });
      expect(f.writes).toEqual([]);
    });
    it('does not replay a previous mutation as success after downgrade', async () => {
      const f = workspaceBackend('editor');
      await handler(request(payload), f.runtime);
      f.writes.length = 0;
      f.docs['spaces/s/members/u'].role = 'viewer';
      const before = JSON.stringify(f.docs);
      await expect(handler(request(payload), f.runtime)).rejects.toMatchObject({ code: 'permission-denied' });
      expect(f.writes).toEqual([]);
      expect(JSON.stringify(f.docs)).toBe(before);
    });
    it('rejects operations when the workspace is suspended', async () => {
      const f = workspaceBackend('editor');
      f.docs['spaces/s'].status = 'suspended';
      await expect(handler(request(payload), f.runtime)).rejects.toMatchObject({code:'failed-precondition'});
      expect(f.writes).toEqual([]);
    });
  },
);

describe('read paths and owner-only shared settings', () => {
  it('allows viewer archive/reminder/profile reads with zero writes, including no reminder reconciliation', async () => {
    const f = workspaceBackend('viewer');
    await dailyArchiveCommandHandler(request({ action: 'list' }), f.runtime);
    const reminders = await reminderCommandHandler(
      request({ action: 'list' }),
      f.runtime,
    );
    expect(reminders.reminders.map((r) => r.id)).toEqual(['r']);
    await storeProfileCommandHandler(
      request({ action: 'getOrCreate', profile: workspaceTestProfile }),
      f.runtime,
    );
    expect(f.writes).toEqual([]);
    expect(f.docs['spaces/s/reminders/due-date_d']).toBeUndefined();
  });
  it.each(['editor', 'viewer'])(
    'denies shared settings edits and profile creation for %s',
    async (role) => {
      const f = workspaceBackend(role);
      await expect(
        storeProfileCommandHandler(
          request({ action: 'update', profile: workspaceTestProfile }),
          f.runtime,
        ),
      ).rejects.toMatchObject({ code: 'permission-denied' });
      delete f.docs['spaces/s/storeProfile/profile'];
      await expect(
        storeProfileCommandHandler(
          request({ action: 'getOrCreate', profile: workspaceTestProfile }),
          f.runtime,
        ),
      ).rejects.toMatchObject({ code: 'permission-denied' });
      expect(f.writes).toEqual([]);
    },
  );
  it('allows only the canonical owner to update workspace business settings', async () => {
    const f = workspaceBackend('owner');
    await storeProfileCommandHandler(
      request({ action: 'update', profile: workspaceTestProfile }),
      f.runtime,
    );
    expect(f.writes).toEqual(['spaces/s/storeProfile/profile']);
    f.writes.length = 0;
    f.docs['spaces/s'].ownerUserId = 'other';
    await expect(
      storeProfileCommandHandler(
        request({ action: 'update', profile: workspaceTestProfile }),
        f.runtime,
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(f.writes).toEqual([]);
  });
  it('rechecks permission before automatic reminder writes on conflict retry', async () => {
    const f = workspaceBackend('editor');
    f.retryOnce(() => {
      f.docs['spaces/s/members/u'].role = 'viewer';
    });
    const result = await reminderCommandHandler(
      request({ action: 'list' }),
      f.runtime,
    );
    expect(result.reminders.map((r) => r.id)).toEqual(['r']);
    expect(f.writes).toEqual([]);
  });
  it('rechecks canonical owner settings permission on conflict retry', async () => {
    const f = workspaceBackend('owner');
    f.retryOnce(() => { f.docs['spaces/s/members/u'].role = 'editor'; });
    await expect(storeProfileCommandHandler(request({ action: 'update', profile: workspaceTestProfile }), f.runtime)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(f.writes).toEqual([]);
  });
  it('records the authenticated actor for debt changes and closings', async () => {
    const f = workspaceBackend('editor');
    await settleCustomerDebtHandler(request(mutations[3][2]), f.runtime);
    expect(f.docs['spaces/s/debts/d']).toMatchObject({
      amount: 90,
      updatedByUserId: 'u',
    });
    const g = workspaceBackend('editor');
    await dailyArchiveCommandHandler(request(mutations[4][2]), g.runtime);
    expect(
      Object.entries(g.docs).find(([path]) =>
        path.startsWith('spaces/s/dailyArchives/'),
      )?.[1].closedByUserId,
    ).toBe('u');
  });
});
