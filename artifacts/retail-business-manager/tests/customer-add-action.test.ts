import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translate, type Language } from '@/constants/i18n';

const state = vi.hoisted(() => ({
  role: 'owner',
  language: 'ar' as Language,
  platform: 'web',
  cursor: 0,
  slots: [] as unknown[],
  buttons: {} as Record<string, () => void>,
  create: vi.fn(),
  form: null as null | { visible: boolean; onClose: () => void; onSave: (draft: any) => Promise<void> },
}));
// A bounded state harness verifies the actual header/form handlers without native runtime or Firebase writes.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = state.cursor++;
      if (!(index in state.slots)) state.slots[index] = initial;
      return [
        state.slots[index],
        (value: unknown) => {
          state.slots[index] = value;
        },
      ];
    },
  };
});
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return state.platform;
    },
  },
  Alert: { alert: vi.fn() },
  StyleSheet: { create: (value: unknown) => value },
  View: ({ children }: any) => React.createElement('div', null, children),
  Text: ({ children }: any) => React.createElement('span', null, children),
  Pressable: ({ children, testID, onPress, accessibilityLabel }: any) => {
    if (testID) state.buttons[testID] = onPress;
    return React.createElement('button', { 'data-testid': testID, 'aria-label': accessibilityLabel }, children);
  },
  TextInput: ({ value }: any) => React.createElement('input', { defaultValue: value }),
  ActivityIndicator: () => null,
  FlatList: () => null,
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/AppShell', () => ({
  AppShell: ({ children }: any) => React.createElement('main', null, children),
  PageHeader: ({ title, action }: any) => React.createElement('header', null, title, action),
  GlassCard: ({ children }: any) => React.createElement('section', null, children),
  SectionTitle: () => null,
  EmptyState: () => null,
}));
vi.mock('@/components/CustomerFormModal', () => ({
  CustomerFormModal: (props: any) => {
    state.form = props;
    return props.visible ? React.createElement('section', { 'data-testid': 'customer-form' }) : null;
  },
}));
vi.mock('@/components/CustomerDebtSummary', () => ({ CustomerDebtSummary: () => null }));
vi.mock('@/services/customerDebtSummary', () => ({ selectCustomerDebtSummary: () => ({}) }));
vi.mock('@/hooks/useColors', () => ({ useColors: () => ({}) }));
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
  }),
}));
vi.mock('@/context/CustomerContext', () => ({
  useCustomers: () => ({
    customers: [],
    isLoading: false,
    error: null,
    retryCustomers: vi.fn(),
    createCustomer: state.create,
  }),
}));
vi.mock('@/context/DebtContext', () => ({
  useDebts: () => ({
    debts: [],
    credits: [],
    canonicalSpaceId: 's',
    isLoading: false,
    error: null,
    retryDebts: vi.fn(),
  }),
}));
import CustomersScreen from '@/app/customers';

function render() {
  state.cursor = 0;
  state.buttons = {};
  return renderToStaticMarkup(React.createElement(CustomersScreen));
}
beforeEach(() => {
  state.role = 'owner';
  state.language = 'ar';
  state.platform = 'web';
  state.cursor = 0;
  state.slots = [];
  state.buttons = {};
  state.form = null;
  state.create.mockReset();
  state.create.mockResolvedValue(undefined);
});
describe('single customer-add entry point (handler tests, not physical-device acceptance)', () => {
  it.each(['ar', 'tr', 'en'] as const)('retains only the localized upper add action in %s', (language) => {
    state.language = language;
    const markup = render();
    expect(markup.match(/data-testid="add-customer-header"/g)).toHaveLength(1);
    expect(markup).not.toContain('add-customer-button');
    expect(markup).toContain(translate('addCustomer', language));
  });
  it.each(['web', 'android'])(
    'upper action opens the existing form and uses the unchanged save handler on %s',
    async (platform) => {
      state.platform = platform;
      render();
      expect(state.form?.visible).toBe(false);
      state.buttons['add-customer-header']();
      expect(render()).toContain('data-testid="customer-form"');
      await state.form!.onSave({ name: '  Test customer  ', phone: '123', address: 'Address', notes: 'Notes' });
      expect(state.create).toHaveBeenCalledOnce();
      expect(state.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test customer',
          phone: '123',
          address: 'Address',
          notes: 'Notes',
          storeId: 'store',
          isActive: true,
        }),
      );
      render();
      expect(state.form?.visible).toBe(false);
    },
  );
  it('keeps the form open if the authoritative save fails', async () => {
    state.create.mockRejectedValueOnce(new Error('permission-denied'));
    render();
    state.buttons['add-customer-header']();
    render();
    await state.form!.onSave({ name: 'Test' });
    render();
    expect(state.form?.visible).toBe(true);
  });
  it('allows Editor to open the same form, but does not show any add action to Viewer', () => {
    state.role = 'editor';
    render();
    expect(state.buttons['add-customer-header']).toBeTypeOf('function');
    state.role = 'viewer';
    const markup = render();
    expect(markup).not.toContain('add-customer-header');
    expect(markup).not.toContain('add-customer-button');
  });
  it('cancels without creating a customer', () => {
    render();
    state.buttons['add-customer-header']();
    render();
    state.form!.onClose();
    render();
    expect(state.form?.visible).toBe(false);
    expect(state.create).not.toHaveBeenCalled();
  });
});
