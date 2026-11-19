import { describe, expect, it } from 'vitest';
import { assertLifecycleTargetWritable } from '../functions/src/workspaceAccess';

describe('assertLifecycleTargetWritable', () => {
  it('keeps legacy targets writable when no lifecycle state exists', () => {
    expect(() => assertLifecycleTargetWritable({ id: 'legacy' }, 'customer')).not.toThrow();
    expect(() => assertLifecycleTargetWritable(null, 'merchant')).not.toThrow();
  });

  it('allows only explicitly active lifecycle state when the field is present', () => {
    expect(() => assertLifecycleTargetWritable({ lifecycleStatus: 'active' }, 'customer')).not.toThrow();
    for (const lifecycleStatus of ['deleting', 'archiving', 'deleted', 'archived']) {
      expect(() => assertLifecycleTargetWritable({ lifecycleStatus }, 'customer'))
        .toThrow('customer is in a destructive lifecycle transition');
    }
  });

  it('fails closed for malformed lifecycle states', () => {
    for (const lifecycleStatus of [null, '', 'pending', 1, false, {}]) {
      expect(() => assertLifecycleTargetWritable({ lifecycleStatus }, 'merchant'))
        .toThrow('merchant lifecycle state is invalid');
    }
  });

  it('returns stable machine-readable error codes', () => {
    try {
      assertLifecycleTargetWritable({ lifecycleStatus: 'deleting' }, 'customer');
      throw new Error('expected lifecycle guard to reject');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'failed-precondition',
        details: { code: 'CUSTOMER_LIFECYCLE_LOCKED' },
      });
    }
  });
});
