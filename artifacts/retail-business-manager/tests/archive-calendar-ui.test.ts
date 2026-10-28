import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translate, type Language } from '@/constants/i18n';
import type { DailyArchive } from '@/types/business';

const state = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  focus: null as null | (() => () => void),
  buttons: {} as Record<string, () => void>,
  language: 'ar' as Language,
  platform: 'web',
  picker: null as any,
  web: null as any,
  load: vi.fn(),
  statuses: vi.fn(),
  emitArchive: null as null | ((rows: DailyArchive[]) => void),
  failArchive: null as null | ((error: Error) => void),
  share: vi.fn(),
  navigate: vi.fn(),
  savePdf: vi.fn(),
  authorizePdf: vi.fn(),
  store: {
    profile: { id: 'store', name: 'Test' },
    isReady: true,
    isAuthenticated: true,
    activeSpaceId: 's',
    sessionKey: 'session-a',
    workspaceRole: 'owner' as string | null,
    activeSpaceLoading: false,
    activeSpaceError: null as string | null,
    initializationError: null,
  },
}));
// Bounded handler/race harness, not a browser, native calendar or live Firebase test.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useRef: (initial: unknown) => { const index = state.cursor++; return state.slots[index] ?? (state.slots[index] = { current: initial }); },
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.slots)) state.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [
      state.slots[index],
      (value: unknown) => {
        state.slots[index] = typeof value === 'function' ? value(state.slots[index]) : value;
      },
    ];
  },
}));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: state.navigate }),
  useFocusEffect: (callback: () => () => void) => {
    state.focus = callback;
  },
}));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return state.platform;
    },
  },
  StyleSheet: { create: (value: unknown) => value },
  View: ({ children }: any) => React.createElement('div', null, children),
  Text: ({ children }: any) => React.createElement('span', null, children),
  Pressable: ({ children, onPress, disabled, testID, accessibilityLabel }: any) => {
    if (testID && !disabled) state.buttons[testID] = onPress;
    return React.createElement(
      'button',
      { 'data-testid': testID, disabled, 'aria-label': accessibilityLabel },
      children,
    );
  },
  ActivityIndicator: ({ testID }: any) => React.createElement('i', { 'data-testid': testID }),
  Modal: ({ visible, children }: any) => (visible ? React.createElement('aside', null, children) : null),
  Share: { share: state.share },
  Alert: { alert: vi.fn() },
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('@react-native-community/datetimepicker', () => ({
  default: (props: any) => {
    state.picker = props;
    return null;
  },
}));
vi.mock('@/components/WebDebtDateInput', () => ({
  WebDebtDateInput: (props: any) => {
    state.web = props;
    return null;
  },
}));
vi.mock('@/context/StoreContext', () => ({ useStore: () => state.store }));
vi.mock('@/services/cloudDailyArchives', () => ({ loadCloudDailyArchivesForDate: state.statuses }));
vi.mock('@/services/archivePdfAccess', () => ({ authorizeArchivePdf: state.authorizePdf }));
vi.mock('@/services/saveMerchantStatement', () => ({ saveMerchantStatement: state.savePdf }));
vi.mock('@/services/archiveDayFirestore', () => ({
  subscribeArchiveDay: (space: string, store: string, date: string, publish: any, fail: any) => {
    let active = true;
    state.emitArchive = rows => { if (active) publish(rows); };
    state.failArchive = error => { if (active) fail(error); };
    state.load(space, store, date).then((rows: any) => { if (active) publish(rows); },
      (error: any) => { if (active) fail(error); });
    return () => { active = false; };
  },
}));
vi.mock('@/services/storage', () => ({
  getLocalDateKey: (date: Date) =>
    `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
}));
vi.mock('@/hooks/useColors', () => ({ useColors: () => ({}) }));
vi.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    language: state.language,
    isRTL: state.language === 'ar',
    t: (key: any) => translate(key, state.language),
  }),
}));
vi.mock('@/components/AppShell', () => ({
  AppShell: ({ children }: any) => React.createElement('main', null, children),
  PageHeader: ({ title, subtitle, action }: any) => React.createElement('header', null, title, subtitle, action),
  SectionTitle: ({ title }: any) => React.createElement('h2', null, title),
  EmptyState: ({ title, hint }: any) => React.createElement('p', null, title, hint),
  GlassCard: ({ children, testID }: any) => React.createElement('section', { 'data-testid': testID }, children),
}));
import ArchiveScreen from '@/app/archive';
import { ArchiveDayPicker } from '@/components/ArchiveDayPicker';
import { useArchiveDay } from '@/hooks/useArchiveDay';

const day = '2026-10-21';
const archive: DailyArchive = {
  id: 'first',
  storeId: 'store',
  date: day,
  closingNumber: 1,
  closedAt: `${day}T15:00:00.000Z`,
  closingCashBalances: [{ currency: 'TRY', amount: -30 }],
  snapshot: [
    {
      id: 'transaction:a',
      storeId: 'store',
      sourceId: 'a',
      type: 'cash_out',
      amount: 30,
      currency: 'TRY',
      note: 'First closing note',
      occurredAt: `${day}T12:00:00.000Z`,
    },
  ],
};
function render(element: React.ReactElement) {
  state.cursor = 0;
  state.buttons = {};
  state.web = null;
  state.picker = null;
  return renderToStaticMarkup(element);
}
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  state.cursor = 0;
  state.slots = [];
  state.focus = null;
  state.language = 'ar';
  state.platform = 'web';
  state.store = {
    profile: { id: 'store', name: 'Test' },
    isReady: true,
    isAuthenticated: true,
    activeSpaceId: 's',
    sessionKey: 'session-a',
    workspaceRole: 'owner',
    activeSpaceLoading: false,
    activeSpaceError: null,
    initializationError: null,
  };
  state.load.mockReset().mockResolvedValue([archive]);
  state.navigate.mockReset();
  state.statuses.mockReset().mockImplementation(async () => [archive]);
  state.share.mockReset().mockResolvedValue({});
  state.authorizePdf.mockReset().mockResolvedValue(undefined);
  state.savePdf.mockReset().mockImplementation(async (_html, _mode, isCurrent, authorize) => { await authorize(); if (!isCurrent()) throw new Error('exportScopeChanged'); return 'shared'; });
});

describe('archive calendar controls', () => {
  it('uses the workspace financial date for Today rather than the device date', () => {
    const change = vi.fn();
    const element = React.createElement(ArchiveDayPicker, { value: day, today: '2026-10-22', onChange: change });
    render(element);
    state.buttons['archive-calendar-button']();
    render(element);
    state.buttons['archive-today']();
    expect(change).toHaveBeenCalledWith('2026-10-22');
    expect(state.load).not.toHaveBeenCalled();
  });
  it.each(['ar', 'en', 'tr'] as const)(
    'shows only a small icon until opened, then a localized %s month grid without network reads',
    (language) => {
      state.language = language;
      const change = vi.fn();
      const html = render(React.createElement(ArchiveDayPicker, { value: day, onChange: change }));
      expect(html).toContain(translate('archiveChooseDate', language));
      expect(html).not.toContain('archive-calendar-date-');
      state.buttons['archive-calendar-button']();
      const opened = render(React.createElement(ArchiveDayPicker, { value: day, onChange: change }));
      expect(opened).toContain(translate('archivePreviousMonth', language));
      expect(opened).toContain('archive-calendar-date-2026-10-21');
      state.buttons['archive-previous-month']();
      render(React.createElement(ArchiveDayPicker, { value: day, onChange: change }));
      expect(state.buttons['archive-calendar-date-2026-09-20']).toBeTypeOf('function');
      expect(change).not.toHaveBeenCalled();
      expect(state.load).not.toHaveBeenCalled();
    },
  );
  it('chooses a date from the actual grid and closes the calendar', () => {
    const change = vi.fn();
    const element = React.createElement(ArchiveDayPicker, { value: day, onChange: change });
    render(element);
    state.buttons['archive-calendar-button']();
    render(element);
    state.buttons['archive-calendar-date-2026-10-18']();
    expect(change.mock.calls).toEqual([['2026-10-18']]);
    expect(render(element)).not.toContain('archive-calendar-dialog');
  });
  it('cancels month browsing without changing the date; reopening resets to the selected month', () => {
    const change = vi.fn();
    const element = React.createElement(ArchiveDayPicker, { value: day, onChange: change });
    render(element);
    state.buttons['archive-calendar-button']();
    render(element);
    state.buttons['archive-previous-month']();
    render(element);
    state.buttons['archive-calendar-cancel']();
    expect(change).not.toHaveBeenCalled();
    render(element);
    state.buttons['archive-calendar-button']();
    render(element);
    expect(state.buttons['archive-calendar-date-2026-10-21']).toBeTypeOf('function');
    expect(state.buttons['archive-calendar-date-2026-09-21']).toBeUndefined();
  });
});

describe('archive day scope and request races', () => {
  let output: ReturnType<typeof useArchiveDay>;
  function Probe({ date }: { date: string }) {
    output = useArchiveDay(date);
    return null;
  }
  function probe(date = day) {
    render(React.createElement(Probe, { date }));
    return output!;
  }
  it('shows server-confirmed saved values without waiting for current-status reads', async () => {
    const pending = deferred<DailyArchive[]>();
    state.statuses.mockReturnValueOnce(pending.promise);
    probe(); const cleanup = state.focus!(); await settle();
    expect(probe()).toMatchObject({ archives: [archive], isLoading: false, error: false, statusesPending: true });
    pending.resolve([{ ...archive, operationStatuses: { 'transaction:a': 'cancelled' } }]);
    await settle();
    expect(probe()).toMatchObject({ statusesPending: false, statusesError: false });
    expect(output!.archives[0]).toMatchObject({ snapshot: archive.snapshot, operationStatuses: { 'transaction:a': 'cancelled' } });
    cleanup();
  });
  it('invalidates pending status responses when server confirmation is lost or a newer closing arrives', async () => {
    const old = deferred<DailyArchive[]>();
    const fresh = deferred<DailyArchive[]>();
    state.statuses.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    probe(); state.focus!(); await settle();
    state.failArchive!(new Error('archiveAwaitingServer'));
    expect(probe()).toMatchObject({ archives: [], isLoading: true, error: false });
    const newer = { ...archive, id: 'newer', closingNumber: 2 };
    state.emitArchive!([newer]);
    old.resolve([{ ...archive, operationStatuses: { 'transaction:a': 'cancelled' } }]);
    await settle();
    expect(probe()).toMatchObject({ archives: [newer], statusesPending: true });
    fresh.resolve([newer]); await settle();
    expect(probe()).toMatchObject({ statusesPending: false, statusesError: false });
  });
  it('keeps saved values readable with an explicit unverified-status error, never a false verified result', async () => {
    state.statuses.mockRejectedValueOnce(new Error('unavailable'));
    probe(); state.focus!(); await settle(); await settle();
    expect(probe()).toMatchObject({ archives: [archive], isLoading: false, error: false, statusesError: true });
  });
  it.each(['functions/permission-denied', 'functions/unauthenticated', 'functions/failed-precondition'])(
    'clears saved values if the backend rejects current access (%s)', async code => {
      state.statuses.mockRejectedValueOnce({ code });
      probe(); state.focus!(); await settle(); await settle();
      expect(probe()).toMatchObject({ archives: [], error: true });
    });
  it('does not overlay statuses for a different saved source or after leaving the day', async () => {
    state.statuses.mockResolvedValueOnce([{ ...archive, snapshot: [{ ...archive.snapshot[0], sourceId: 'wrong' }],
      operationStatuses: { 'transaction:a': 'cancelled' } }]);
    probe(); const cleanup = state.focus!(); await settle(); await settle();
    expect(probe()).toMatchObject({ archives: [archive], statusesError: true });
    cleanup();
    const pending = deferred<DailyArchive[]>(); state.statuses.mockReturnValueOnce(pending.promise);
    const leave = state.focus!(); await settle(); leave();
    expect(probe('2026-10-20').archives).toEqual([]);
    pending.resolve([{ ...archive, operationStatuses: { 'transaction:a': 'cancelled' } }]);
    await settle(); expect(probe('2026-10-20').archives).toEqual([]);
  });
  it('hides the previous day immediately and ignores its late response after changing dates', async () => {
    const first = deferred<DailyArchive[]>();
    const second = deferred<DailyArchive[]>();
    state.load.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    expect(probe().isLoading).toBe(true);
    const cleanup = state.focus!();
    expect(probe('2026-10-20').archives).toEqual([]);
    cleanup();
    state.focus!();
    first.resolve([archive]);
    await settle();
    expect(probe('2026-10-20').archives).toEqual([]);
    second.resolve([]);
    await settle();
    expect(probe('2026-10-20')).toMatchObject({ archives: [], isLoading: false, error: false });
    expect(state.load.mock.calls).toEqual([
      ['s', 'store', day],
      ['s', 'store', '2026-10-20'],
    ]);
  });
  it.each(['space', 'session', 'role', 'store'])('hides loaded data before effects when %s changes', async (scope) => {
    probe();
    state.focus!();
    await settle();
    expect(probe().archives).toEqual([archive]);
    if (scope === 'space') state.store.activeSpaceId = 'other';
    if (scope === 'session') state.store.sessionKey = 'another-user';
    if (scope === 'role') state.store.workspaceRole = 'viewer';
    if (scope === 'store') state.store.profile.id = 'other';
    expect(probe().archives).toEqual([]);
  });
  it('does not display old archives after membership removal or logout, nor issue another read', async () => {
    probe();
    const cleanup = state.focus!();
    await settle();
    expect(probe().archives).toHaveLength(1);
    state.store.workspaceRole = null;
    expect(probe()).toMatchObject({ archives: [], error: true });
    cleanup();
    state.focus!();
    state.store.isAuthenticated = false;
    probe();
    state.focus!();
    expect(state.load).toHaveBeenCalledOnce();
  });
  it('distinguishes failure from a confirmed empty day and supports retry', async () => {
    state.load.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce([]);
    probe();
    const cleanup = state.focus!();
    await settle();
    expect(probe().error).toBe(true);
    output!.retry();
    probe();
    cleanup();
    state.focus!();
    await settle();
    expect(probe()).toMatchObject({ archives: [], isLoading: false, error: false });
  });
});

describe('archive screen reuses separate immutable closings', () => {
  it.each(['ar', 'en', 'tr'] as const)('renders saved events and a localized %s checking notice before status completion', async language => {
    state.language = language;
    state.statuses.mockReturnValueOnce(new Promise(() => {}));
    const element = React.createElement(ArchiveScreen);
    render(element); state.focus!(); await settle();
    const html = render(element);
    expect(html).toContain('First closing note');
    expect(html).toContain(translate('archiveStatusesPending', language));
    expect(html).not.toContain('archive-loading');
  });
  it('shows every closing of the selected day separately and shares only the selected snapshot', async () => {
    const second = {
      ...archive,
      id: 'second',
      closingNumber: 2,
      snapshot: [{ ...archive.snapshot[0], id: 'transaction:b', sourceId: 'b', note: 'Second closing note' }],
    };
    const saved = [second, archive];
    const before = structuredClone(saved);
    state.load.mockResolvedValue(saved);
    const element = React.createElement(ArchiveScreen);
    expect(render(element)).toContain('archive-loading');
    state.focus!();
    await settle();
    let html = render(element);
    expect(html).toContain(`archive-day-${day}-1`);
    expect(html).toContain(`archive-day-${day}-2`);
    expect(html).toContain('Second closing note');
    expect(html).not.toContain('First closing note');
    state.buttons[`archive-day-${day}-1`]();
    html = render(element);
    expect(html).toContain('First closing note');
    expect(html).not.toContain('Second closing note');
    state.buttons['share-archive-button']();
    await settle();
    expect(state.share).toHaveBeenCalledWith({ message: expect.stringContaining('First closing note') });
    expect(state.share.mock.calls[0][0].message).not.toContain('Second closing note');
    render(element);
    await state.buttons['share-archive-pdf-button']();
    await settle();
    expect(state.authorizePdf).toHaveBeenCalledWith('s', 'store', archive);
    expect(state.savePdf.mock.calls[0][0]).toContain('First closing note');
    expect(state.savePdf.mock.calls[0][0]).not.toContain('Second closing note');
    expect(state.savePdf.mock.calls[0][1]).toBe('share');
    expect(saved).toEqual(before);
  });
  it.each(['ar', 'en', 'tr'] as const)(
    'shows a clear %s empty-day message, not an error or old content',
    async (language) => {
      state.language = language;
      state.load.mockResolvedValueOnce([]);
      const element = React.createElement(ArchiveScreen);
      render(element);
      state.focus!();
      await settle();
      const html = render(element);
      expect(html).toContain(translate('archiveDayEmpty', language));
      expect(html).not.toContain('share-archive-button');
      state.buttons['archive-open-journal-history']();
      expect(state.navigate).toHaveBeenCalledExactlyOnceWith({ pathname: '/journal-history', params: { date: state.load.mock.calls[0][2] } });
      expect(state.load).toHaveBeenCalledOnce();
    },
  );
});
