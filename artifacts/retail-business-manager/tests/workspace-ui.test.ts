import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translate, type Language } from '@/constants/i18n';
const state = vi.hoisted(() => ({ role: 'owner', language: 'ar' as Language }));
vi.mock('react-native', () => ({
  View: ({ children }: any) => React.createElement('div', null, children),
  Text: ({ children }: any) => React.createElement('span', null, children),
  TextInput: ({ value, editable, accessibilityLabel }: any) =>
    React.createElement('input', {
      value,
      readOnly: true,
      disabled: editable === false,
      'aria-label': accessibilityLabel,
    }),
  Pressable: ({ children, disabled, testID }: any) =>
    React.createElement('button', { disabled, 'data-testid': testID }, children),
  FlatList: ({ data, renderItem }: any) =>
    React.createElement(
      'div',
      null,
      data.map((item: any) => React.createElement('div', { key: item.id }, renderItem({ item }))),
    ),
  ActivityIndicator: () => null,
  Modal: () => null,
  Alert: { alert: vi.fn() },
  StyleSheet: { create: (value: any) => value },
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('@/hooks/useColors', () => ({ useColors: () => ({ primary: '#123', foreground: '#fff' }) }));
vi.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    language: state.language,
    isRTL: state.language === 'ar',
    t: (key: any) => translate(key, state.language),
  }),
}));
vi.mock('@/context/StoreContext', () => ({
  useStore: () => ({
    profile: { id: 'store' },
    activeSpaceId: 's',
    isReady: true,
    isAuthenticated: true,
    canWriteBusiness: state.role === 'owner' || state.role === 'editor',
    workspaceRole: state.role,
  }),
}));
vi.mock('@/context/CustomerContext', () => ({
  useCustomers: () => ({
    customers: [],
    isLoading: false,
    error: null,
    retryCustomers: vi.fn(),
    createCustomer: vi.fn(),
  }),
}));
vi.mock('@/context/DebtContext', () => ({
  useDebts: () => ({ debts: [], canonicalSpaceId: 's', isLoading: false, error: null, retryDebts: vi.fn() }),
}));
vi.mock('@/components/AppShell', () => ({
  AppShell: ({ children }: any) => React.createElement('main', null, children),
  PageHeader: ({ title, action }: any) => React.createElement('header', null, title, action),
  GlassCard: ({ children }: any) => React.createElement('section', null, children),
  SectionTitle: () => null,
  EmptyState: () => null,
}));
vi.mock('@/components/CustomerDebtSummary', () => ({ CustomerDebtSummary: () => null }));
vi.mock('@/components/CustomerFormModal', () => ({ CustomerFormModal: () => null }));
vi.mock('@/services/dailyClosing', () => ({ runDailyClosing: vi.fn() }));
import CustomersScreen from '@/app/customers';
import { DailyClosingAction } from '@/components/DailyClosingAction';
import { WorkspaceInput, WorkspaceRolePicker } from '@/components/WorkspaceControls';

describe('workspace read-only controls (server render, not device testing)', () => {
  beforeEach(() => {
    state.role = 'owner';
    state.language = 'ar';
  });
  it.each(['owner', 'editor', 'viewer'])('only exposes customer creation to business writers: %s', (role) => {
    state.role = role;
    const html = renderToStaticMarkup(React.createElement(CustomersScreen));
    expect(html.includes('add-customer-header')).toBe(role !== 'viewer');
    expect(html.includes('add-customer-button')).toBe(false); // Duplicate lower action removed for every role.
  });
  it.each(['owner', 'editor', 'viewer'])('never falls back to manual closing when automatic closing is unconfigured: %s', (role) => {
    state.role = role;
    const html = renderToStaticMarkup(
      React.createElement(DailyClosingAction, { spaceId: 's', storeId: 'store', testID: 'closing' }),
    );
    expect(html).toContain(translate('workspaceClosingPrepared', state.language));
    expect(html).not.toContain(translate('closeDay', state.language));
    expect(html.includes(translate('workspaceClosingSettings', state.language))).toBe(role === 'owner');
  });
  it.each(['ar', 'en', 'tr'] as const)('uses the existing %s dictionary for member roles', (language) => {
    state.language = language;
    const html = renderToStaticMarkup(React.createElement(WorkspaceRolePicker, { value: 'viewer', onChange: vi.fn() }));
    expect(html).toContain(translate('workspaceEditor', language));
    expect(html).toContain(translate('workspaceViewer', language));
  });
  it('makes a disabled workspace form field genuinely non-editable', () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkspaceInput, { label: 'Name', value: 'Shop', onChangeText: vi.fn(), disabled: true }),
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('readOnly=""');
  });
});
