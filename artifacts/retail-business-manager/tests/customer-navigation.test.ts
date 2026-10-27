import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import customerDetailsSource from '../app/customer/[id].tsx?raw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '@/constants/i18n';

const state = vi.hoisted(() => ({ financialLoading: false, reminderError: false }));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: (initial: any) => actual.useState(
    state.reminderError && initial?.status === 'loading' && Array.isArray(initial.rows)
      ? { ...initial, status: 'error' } : initial,
  ) };
});
vi.mock('react-native', () => ({
  StyleSheet: { create: (value: unknown) => value },
  Alert: { alert: vi.fn() }, Linking: {}, Share: {},
  View: ({ children }: any) => React.createElement('div', null, children),
  Text: ({ children }: any) => React.createElement('span', null, children),
  TextInput: () => null,
  Modal: () => null,
  Pressable: ({ children, testID }: any) => React.createElement('button', { 'data-testid': testID }, children),
  ActivityIndicator: ({ testID }: any) => React.createElement('i', { 'data-testid': testID ?? 'financial-loading' }),
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'c' }), useRouter: () => ({}), useFocusEffect: vi.fn() }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock('@/components/AppShell', () => ({
  AppShell: ({ children }: any) => React.createElement('main', null, children),
  GlassCard: ({ children }: any) => React.createElement('section', null, children),
  PageHeader: ({ title }: any) => React.createElement('h1', null, title),
  SectionTitle: ({ title }: any) => React.createElement('h2', null, title),
  EmptyState: ({ title }: any) => React.createElement('aside', null, title),
}));
vi.mock('@/components/ActorBadge', () => ({ ActorBadge: () => null }));
vi.mock('@/components/CustomerOperationEditor', () => ({ CustomerOperationEditor: () => null }));
// This navigation contract does not open export or exercise native print modules.
vi.mock('@/components/CustomerStatementModal', () => ({ CustomerStatementModal: () => null }));
vi.mock('@/components/CustomerFormModal', () => ({ CustomerFormModal: () => null }));
vi.mock('@/components/DebtForm', () => ({ DebtForm: () => null }));
vi.mock('@/components/ReminderForm', () => ({ ReminderForm: () => null }));
vi.mock('@/components/KeyboardAwareScrollViewCompat', () => ({ KeyboardAwareScrollViewCompat: () => null }));
vi.mock('@/hooks/useColors', () => ({ useColors: () => ({}) }));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ language: 'en', isRTL: false, t: (key: any) => translate(key, 'en') }) }));
vi.mock('@/context/StoreContext', () => ({ useStore: () => ({ profile: { id: 'store', currency: 'TRY', visibleCurrencies: ['TRY', 'USD'] },
  isReady: true, activeSpaceId: 's', sessionKey: 'session', canWriteBusiness: true }) }));
vi.mock('@/context/CustomerContext', () => ({ useCustomers: () => ({
  customers: [{ id: 'c', name: 'Ready customer', phone: '', address: '', notes: '', isActive: true,
    createdAt: '2026-10-23T00:00:00.000Z' }], isLoading: false,
}) }));
vi.mock('@/context/DebtContext', () => ({ useDebts: () => ({ debts: [], credits: [], isLoading: state.financialLoading }) }));
vi.mock('@/context/PaymentContext', () => ({ usePayments: () => ({ payments: [], isLoading: state.financialLoading }) }));
vi.mock('@/services/cloudReminders', () => ({ createCloudReminder: vi.fn(), loadCloudReminders: vi.fn() }));
vi.mock('@/services/preferences', () => ({ loadNotificationTime: vi.fn() }));
vi.mock('@/services/customerSharing', () => ({ buildCustomerStatement: vi.fn() }));
import CustomerDetailsScreen from '@/app/customer/[id]';
beforeEach(() => { state.financialLoading = false; state.reminderError = false; });
describe('customer page independent reminder loading (SSR contract, not device timing)', () => {
  it('renders the account while only the reminder section is loading', () => {
    const html = renderToStaticMarkup(React.createElement(CustomerDetailsScreen));
    expect(html).toContain('Ready customer');
    expect(html).toContain('customer-reminders-loading');
    expect(html).not.toContain('financial-loading');
    expect(html).not.toContain(translate('remindersEmpty', 'en'));
  });
  it('still blocks unconfirmed financial data instead of displaying it as loaded', () => {
    state.financialLoading = true;
    const html = renderToStaticMarkup(React.createElement(CustomerDetailsScreen));
    expect(html).toContain('financial-loading');
    expect(html).not.toContain('Ready customer');
  });
  it('keeps account access on reminder failure and offers a section-specific retry', () => {
    state.reminderError = true;
    const html = renderToStaticMarkup(React.createElement(CustomerDetailsScreen));
    expect(html).toContain('Ready customer');
    expect(html).toContain('retry-customer-reminders');
    expect(html).not.toContain(translate('remindersEmpty', 'en'));
  });
  it('does not requery reminders on debt/payment snapshots, and scopes late results', () => {
    const source = customerDetailsSource;
    const effect = source.slice(source.indexOf('  useFocusEffect('), source.indexOf('  const updateCustomer'));
    expect(effect).not.toContain('workspaceDebts');
    expect(effect).not.toContain('workspacePayments');
    expect(effect).toContain('currentReminderScope.current === reminderScope');
    expect(source).toContain('reminderState.scope !== reminderScope');
  });
});
