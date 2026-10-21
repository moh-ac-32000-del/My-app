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
  share: vi.fn(),
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
vi.mock('@/services/cloudDailyArchives', () => ({ loadCloudDailyArchivesForDate: state.load }));
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
  PageHeader: ({ title }: any) => React.createElement('header', null, title),
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
  state.share.mockReset().mockResolvedValue({});
});

describe('archive calendar controls', () => {
  it.each(['ar', 'en', 'tr'] as const)(
    'uses the current %s dictionary and moves one day without a network call',
    (language) => {
      state.language = language;
      const change = vi.fn();
      const html = render(React.createElement(ArchiveDayPicker, { value: day, onChange: change }));
      expect(html).toContain(translate('archiveChooseDate', language));
      expect(html).toContain(translate('archivePreviousDay', language));
      state.buttons['archive-previous-day']();
      state.buttons['archive-next-day']();
      expect(change.mock.calls).toEqual([['2026-10-20'], ['2026-10-22']]);
      expect(state.load).not.toHaveBeenCalled();
    },
  );
  it('opens the web date field and ignores empty/invalid intermediate input', () => {
    const change = vi.fn();
    const element = React.createElement(ArchiveDayPicker, { value: day, onChange: change });
    render(element);
    state.buttons['archive-calendar-button']();
    render(element);
    expect(state.web.value).toBe(day);
    state.web.onChange('');
    state.web.onChange('2026-02-30');
    state.web.onChange('2024-02-29');
    expect(change.mock.calls).toEqual([['2024-02-29']]);
  });
  it('uses the native calendar on Android and does not change the date when dismissed', () => {
    state.platform = 'android';
    const change = vi.fn();
    const element = React.createElement(ArchiveDayPicker, { value: day, onChange: change });
    render(element);
    state.buttons['archive-calendar-button']();
    render(element);
    expect(state.web).toBeNull();
    expect(state.picker.mode).toBe('date');
    state.picker.onChange({ type: 'dismissed' }, new Date(2026, 9, 20));
    expect(change).not.toHaveBeenCalled();
    render(element);
    state.buttons['archive-calendar-button']();
    render(element);
    state.picker.onChange({ type: 'set' }, new Date(2026, 9, 20));
    expect(change).toHaveBeenCalledWith('2026-10-20');
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
    },
  );
});
