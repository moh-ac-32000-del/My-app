type Data = Record<string, any>;
type Filter = [string, string, any];
export const workspaceTestTime = '2026-10-19T12:00:00.000Z';
export const workspaceTestProfile = {
  name: 'Test',
  phone: '',
  address: '',
  currency: 'TRY',
  quickCurrencies: ['TRY'],
  visibleCurrencies: ['TRY'],
  language: 'ar',
  accent: 'blue',
};

/** In-memory transaction fixture: staged writes, read-before-write checks and a simulated conflict retry. */
export function workspaceBackend(role: unknown = 'owner') {
  const now = workspaceTestTime;
  const docs: Record<string, Data> = {
    'spaces/s': { spaceId: 's', status: 'active', ownerUserId: 'u' },
    'spaces/s/members/u': { spaceId: 's', userId: 'u', status: 'active', role },
    'spaces/s/storeProfile/profile': {
      ...workspaceTestProfile,
      id: 'store',
      storeId: 'store',
    },
    'spaces/s/customers/c': {
      id: 'c',
      workspaceId: 's',
      storeId: 'store',
      name: 'Test customer',
      isActive: true,
    },
    'spaces/s/debts/d': {
      id: 'd',
      workspaceId: 's',
      storeId: 'store',
      customerId: 'c',
      amount: 100,
      originalAmount: 120,
      currency: 'TRY',
      dueDate: '2026-10-20',
      createdAt: now,
      updatedAt: now,
    },
    'spaces/s/reminders/r': {
      id: 'r',
      workspaceId: 's',
      storeId: 'store',
      debtId: 'd',
      status: 'pending',
      remindAt: now,
      createdAt: now,
      updatedAt: now,
    },
  };
  const reads: string[] = [];
  const writes: string[] = [];
  const batches: string[][] = [];
  let conflict: (() => void) | null = null;
  let queue = Promise.resolve();
  const snapshot = (reference: any): any => {
    reads.push(reference.path);
    if (reference.filters)
      return {
        docs: Object.entries(docs)
          .filter(
            ([path, data]) =>
              path.startsWith(reference.path + '/') &&
              path.split('/').length === reference.path.split('/').length + 1 &&
              reference.filters.every(([field, op, value]: Filter) =>
                op === '=='
                  ? field.split('.').reduce((entry, key) => entry?.[key], data) === value
                  : op === '>'
                    ? data[field] > value
                  : op === '>='
                    ? data[field] >= value
                    : op === '<='
                      ? data[field] <= value
                    : data[field] < value,
              ),
          )
          .map(([path, data]) => ({
            id: path.split('/').at(-1),
            ref: ref(path),
            exists: true,
            data: () => structuredClone(data),
          })).sort((a, b) => reference.order ? String(a.data()[reference.order]).localeCompare(String(b.data()[reference.order])) : 0)
          .slice(0, reference.cap ?? Infinity),
      };
    const value = docs[reference.path]
      ? structuredClone(docs[reference.path])
      : undefined;
    return {
      id: reference.path.split('/').at(-1),
      exists: !!value,
      data: () => value,
    };
  };
  const ref = (path: string, filters?: Filter[], order?: string, cap?: number): any => ({
    path,
    id: path.split('/').at(-1),
    filters,
    order, cap,
    collection: (name: string) => ref(path + '/' + name, []),
    doc: (id: string) => ref(path + '/' + id),
    where: (field: string, op: string, value: any) =>
      ref(path, [...(filters ?? []), [field, op, value]], order, cap),
    orderBy: (field: string) => ref(path, filters, field, cap),
    limit: (size: number) => ref(path, filters, order, size),
    get: async () => snapshot(ref(path, filters, order, cap)),
  });
  const db = {
    collection: (name: string) => ref(name, []),
    runTransaction: async (fn: any) => {
      const prior = queue;
      let release!: () => void;
      queue = new Promise<void>((resolve) => { release = resolve; });
      await prior;
      try {
      for (;;) {
        const pending: Array<() => void> = [];
        const stage = (reference: any, value: Data | undefined, kind: string) =>
          pending.push(() => {
            writes.push(reference.path);
            if (kind === 'delete') delete docs[reference.path];
            else
              docs[reference.path] =
                kind === 'update'
                  ? { ...docs[reference.path], ...value }
                  : value!;
          });
        const result = await fn({
          getAll: async (...references: any[]) => {
            if (pending.length) throw new Error('Reads must precede writes');
            batches.push(references.map(reference => reference.path));
            return references.map(snapshot);
          },
          get: async (reference: any) => {
            if (pending.length) throw new Error('Reads must precede writes');
            return snapshot(reference);
          },
          create: (reference: any, value: Data) => {
            if (docs[reference.path]) throw new Error('already-exists');
            stage(reference, value, 'create');
          },
          set: (reference: any, value: Data) => stage(reference, value, 'set'),
          update: (reference: any, value: Data) =>
            stage(reference, value, 'update'),
          delete: (reference: any) => stage(reference, undefined, 'delete'),
        });
        if (conflict) {
          const change = conflict;
          conflict = null;
          change();
          continue;
        }
        pending.forEach((write) => write());
        return result;
      }
      } finally { release(); }
    },
  };
  return {
    docs,
    reads,
    writes,
    batches,
    db,
    runtime: { firestore: db as never, now: () => now },
    retryOnce(change: () => void) {
      conflict = change;
    },
  };
}
