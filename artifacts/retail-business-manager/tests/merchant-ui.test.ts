import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translate, type Language } from '@/constants/i18n';
const state = vi.hoisted(() => ({
  role: 'owner',
  language: 'ar' as Language,
  loading: false,
  error: null as string | null,
  reversed: false,
  merchantId: 'm',
}));
vi.mock('react-native', () => ({
  View: ({ children, testID }: any) => React.createElement('div', { 'data-testid': testID }, children),
  Text: ({ children }: any) => React.createElement('span', null, children),
  Pressable: ({ children, disabled, testID }: any) =>
    React.createElement('button', { disabled, 'data-testid': testID }, children),
  TextInput: ({ value, editable, accessibilityLabel }: any) =>
    React.createElement('input', {
      value,
      readOnly: true,
      disabled: editable === false,
      'aria-label': accessibilityLabel,
    }),
  ActivityIndicator: () => React.createElement('div', { 'data-testid': 'loading' }),
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }), useLocalSearchParams: () => ({ id: state.merchantId }) }));
vi.mock('@/hooks/useColors', () => ({ useColors: () => ({ foreground: '#fff', primary: '#123' }) }));
vi.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    language: state.language,
    isRTL: state.language === 'ar',
    t: (key: any) => translate(key, state.language),
  }),
}));
vi.mock('@/context/StoreContext', () => ({
  useStore: () => ({
    activeSpaceId: 's',
    profile: { id: 'store', currency: 'TRY' },
    canWriteBusiness: state.role === 'owner' || state.role === 'editor',
  }),
}));
vi.mock('@/context/CustomerContext', () => ({
  useCustomers: () => ({
    customers: [{ id: 'c', name: 'Customer', storeId: 'store', isActive: true }],
    canonicalSpaceId: 's',
    isLoading: false,
    error: null,
  }),
}));
vi.mock('@/components/AppShell', () => ({
  AppShell: ({ children }: any) => React.createElement('main', null, children),
  GlassCard: ({ children, testID }: any) => React.createElement('section', { 'data-testid': testID }, children),
  PageHeader: ({ title, action }: any) => React.createElement('header', null, title, action),
  EmptyState: ({ title }: any) => React.createElement('aside', null, title),
  SectionTitle: ({ title }: any) => React.createElement('h2', null, title),
}));
vi.mock('@/hooks/useMerchantAccounts', () => ({
  useMerchantAccounts: () => ({
    merchants: [{ id: 'm', workspaceId: 's', storeId: 'store', name: 'Merchant A', phone: '', isActive: true }],
    balances: [{ merchantId: 'm', workspaceId: 's', currency: 'TRY', balanceExact: '-300.00' }],
    operations: [
      {
        id: 'operation',
        merchantId: 'm',
        action: 'directPayment',
        customerName: 'Customer',
        note: 'Goods description',
        currency: 'TRY',
        balanceBeforeExact: '100.00',
        balanceAfterExact: '-300.00',
        cashDeltaExact: '0.00',
        amountExact: '400.00',
        createdAt: '2026-10-19T12:00:00.000Z',
        ...(state.reversed ? { reversedByOperationId: 'correction' } : {}),
      },
    ],
    operationsLimited: false,
    isLoading: state.loading,
    error: state.error,
    retry: vi.fn(),
    command: vi.fn(),
  }),
}));
import MerchantsScreen from '@/app/merchants';
import MerchantScreen from '@/app/merchant/[id]';
import { MerchantCommandForm } from '@/components/MerchantCommandForm';

beforeEach(() => {
  state.role = 'owner';
  state.language = 'ar';
  state.loading = false;
  state.error = null;
  state.reversed = false;
  state.merchantId = 'm';
});
describe('merchant screens (server-rendered, not device acceptance)', () => {
  it('keys the detail subtree by merchant so old drafts cannot survive account navigation', () => {
    const first = MerchantScreen();
    state.merchantId = 'another';
    const second = MerchantScreen();
    expect(first.key).toBe('m');
    expect(second.key).toBe('another');
  });
  it.each(['ar', 'tr', 'en'] as const)(
    'shows separated credit/payable/net totals and localized actions in %s',
    (language) => {
      state.language = language;
      const markup = renderToStaticMarkup(React.createElement(MerchantsScreen));
      expect(markup).toContain(translate('merchants', language));
      expect(markup).toContain(translate('merchantPayable', language));
      expect(markup).toContain(translate('merchantCredit', language));
      expect(markup).toContain(translate('merchantNet', language));
      expect(markup).toContain('merchant-add');
      expect(markup).toContain('Merchant A');
    },
  );
  it('hides creation and financial/correction actions for a viewer', () => {
    state.role = 'viewer';
    expect(renderToStaticMarkup(React.createElement(MerchantsScreen))).not.toContain('merchant-add');
    const markup = renderToStaticMarkup(React.createElement(MerchantScreen));
    expect(markup).toContain('Goods description');
    expect(markup).not.toContain('merchant-action-');
    expect(markup).not.toContain(translate('merchantReverse', 'ar'));
  });
  it('shows the direct payment as noncash and retains its customer and notes', () => {
    const markup = renderToStaticMarkup(React.createElement(MerchantScreen));
    expect(markup).toContain(translate('merchantNoncash', 'ar'));
    expect(markup).toContain('Customer');
    expect(markup).toContain('Goods description');
    expect(markup).toContain('merchant-action-purchase');
  });
  it('does not show a second reversal action after an operation has been corrected', () => {
    state.reversed = true;
    const markup = renderToStaticMarkup(React.createElement(MerchantScreen));
    expect(markup).toContain(translate('merchantReversed', 'ar'));
    expect(markup).not.toContain(translate('merchantReverse', 'ar'));
  });
  it('does not replace unavailable accounts with an empty or zero-success state', () => {
    state.error = 'permission-denied';
    const markup = renderToStaticMarkup(React.createElement(MerchantsScreen));
    expect(markup).toContain(translate('merchantUnavailable', 'ar'));
    expect(markup).not.toContain('Merchant A');
    expect(markup).not.toContain(translate('merchantEmpty', 'ar'));
  });
  it.each(['purchase', 'directPayment', 'opening', 'reverse'] as const)(
    'renders the %s form with explicit financial meaning',
    (action) => {
      const markup = renderToStaticMarkup(
        React.createElement(MerchantCommandForm, {
          action,
          command: vi.fn(),
          onDone: vi.fn(),
          onCancel: vi.fn(),
          target: { id: 'op', currency: 'TRY' } as never,
        }),
      );
      expect(markup).toContain('merchant-confirm');
      if (action === 'directPayment') expect(markup).toContain(translate('merchantDirectHint', 'ar'));
      if (action === 'opening') expect(markup).toContain(translate('merchantOpeningHint', 'ar'));
      if (action === 'reverse') expect(markup).toContain(translate('merchantCorrectionHint', 'ar'));
      if (action === 'purchase') expect(markup).toContain(translate('merchantQuantity', 'ar'));
    },
  );
});
