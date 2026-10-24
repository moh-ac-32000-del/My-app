import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translate, type Language } from '@/constants/i18n';
import { formatExactMoney } from '@/data/exactMoneyPresentation';
const state = vi.hoisted(() => ({ list: null as any, scrolls: 0, platform: 'web', language: 'en' as Language,
  role: 'owner' as string | null, error: null as string | null, loading: false, blocked: false,
  session: 's:u:owner', push: vi.fn(), balancesRead: 0, customers: [] as any[], merchants: [] as any[], balances: [] as any[],
}));
// Contract harness: emulate a bounded visible window. This is NOT native/web
// scrolling, frame-time measurement or a replacement for device acceptance.
vi.mock('react-native', () => ({
  Platform: { get OS() { return state.platform; } }, StyleSheet: { create: (value: any) => value },
  View: ({ children, testID }: any) => React.createElement('div', { 'data-testid': testID }, children),
  Text: ({ children }: any) => React.createElement('span', null, children),
  TextInput: () => null, ActivityIndicator: () => React.createElement('i', null, 'loading'), Alert: { alert: vi.fn() },
  Pressable: ({ children, testID }: any) => React.createElement('button', { 'data-testid': testID }, children),
  ScrollView: ({ children }: any) => { state.scrolls++; return React.createElement('div', null, children); },
  FlatList: (props: any) => {
    state.list = props;
    return React.createElement('article', { 'data-testid': props.testID }, props.ListHeaderComponent,
      props.data.length ? props.data.slice(0, props.initialNumToRender).map((item: any, index: number) =>
        React.createElement('div', { key: props.keyExtractor(item, index) }, props.renderItem({ item, index }))) : props.ListEmptyComponent,
      props.ListFooterComponent);
  },
}));
vi.mock('expo-blur', () => ({ BlurView: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialCommunityIcons: () => null }));
vi.mock('expo-router', () => ({ usePathname: () => '/customers', useRouter: () => ({ push: state.push, replace: vi.fn() }) }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 10, bottom: 20 }) }));
vi.mock('@/hooks/useColors', () => ({ useColors: () => ({}) }));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ language: state.language, isRTL: state.language === 'ar',
  direction: state.language === 'ar' ? 'rtl' : 'ltr', t: (key: any) => translate(key, state.language) }) }));
vi.mock('@/context/StoreContext', () => ({ useStore: () => ({ profile: { id: 'store' }, activeSpaceId: 's',
  sessionKey: state.session, workspaceRole: state.role, activeSpaceError: state.blocked ? 'removed' : null,
  isReady: true, isAuthenticated: true, canWriteBusiness: state.role === 'owner', retryActiveSpace: vi.fn() }) }));
vi.mock('@/context/CustomerContext', () => ({ useCustomers: () => ({ customers: state.customers,
  isLoading: state.loading, error: state.error, retryCustomers: vi.fn(), createCustomer: vi.fn() }) }));
vi.mock('@/context/DebtContext', () => ({ useDebts: () => ({ debts: [], credits: [], canonicalSpaceId: 's',
  isLoading: false, error: null, retryDebts: vi.fn() }) }));
vi.mock('@/components/CustomerFormModal', () => ({ CustomerFormModal: () => React.createElement('aside', { 'data-testid': 'customer-overlay' }) }));
vi.mock('@/components/CustomerDebtSummary', () => ({ CustomerDebtSummary: () => React.createElement('p', null, 'full summary') }));
vi.mock('@/components/MerchantCommandForm', () => ({ MerchantCommandForm: () => null }));
vi.mock('@/hooks/useMerchantAccounts', () => ({ useMerchantAccounts: () => ({ merchants: state.merchants, balances: state.balances,
  isLoading: state.loading, error: state.error, retry: vi.fn(), command: vi.fn() }) }));
import CustomersScreen from '@/app/customers';
import MerchantsScreen from '@/app/merchants';
import { AppShell } from '@/components/AppShell';
beforeEach(() => {
  state.list = null; state.scrolls = 0; state.platform = 'web'; state.language = 'en'; state.role = 'owner';
  state.error = null; state.loading = false; state.blocked = false; state.session = 's:u:owner'; state.push.mockReset(); state.balancesRead = 0;
  state.customers = Array.from({ length: 1000 }, (_, i) => ({ id: `c${i}`, storeId: 'store', name: `Customer ${i}`, phone: '', isActive: true }));
  state.merchants = Array.from({ length: 1000 }, (_, i) => ({ id: `m${i}`, workspaceId: 's', storeId: 'store', name: `Merchant ${String(i).padStart(4, '0')}`, isActive: true }));
  state.balances = state.merchants.map(merchant => ({ workspaceId: 's', currency: 'TRY', balanceExact: '1.00',
    get merchantId() { state.balancesRead++; return merchant.id; } }));
});
describe('one scroll owner and bounded party-card rendering', () => {
  it.each(['web', 'android'])('passes all 1000 customers to the %s list, not a truncated financial dataset', platform => {
    state.platform = platform;
    const html = renderToStaticMarkup(React.createElement(CustomersScreen));
    expect(state.scrolls).toBe(0); expect(state.list.data).toHaveLength(1000);
    expect(state.list.scrollEnabled).not.toBe(false);
    expect(state.list.initialNumToRender).toBe(12); expect(state.list.maxToRenderPerBatch).toBe(8);
    expect(html.match(/data-testid="customer-card-/g)).toHaveLength(12);
    expect(html).toContain('full summary'); expect(html).toContain('customer-overlay');
    const late = state.list.renderItem({ item: state.list.data[999], index: 999 });
    expect(state.list.keyExtractor(state.list.data[999])).toBe('c999');
    late.props.onPress(); expect(state.push).toHaveBeenCalledWith({ pathname: '/customer/[id]', params: { id: 'c999' } });
  });
  it.each(['ar', 'en', 'tr'] as const)('keeps full merchant totals and localized %s rows with linear balance indexing', language => {
    state.language = language;
    const before = state.merchants.map(row => row.id);
    const html = renderToStaticMarkup(React.createElement(MerchantsScreen));
    expect(state.scrolls).toBe(0); expect(state.list.data).toHaveLength(1000);
    expect(html.match(/data-testid="merchant-card-/g)).toHaveLength(12);
    expect(html).toContain(translate('merchantNet', language));
    expect(html).toContain(formatExactMoney('1000.00', 'TRY', language));
    expect(state.balancesRead).toBeLessThan(5000); // no per-card scan of all balances
    expect(state.merchants.map(row => row.id)).toEqual(before);
    const late = state.list.renderItem({ item: state.list.data[999], index: 999 });
    late.props.onPress(); expect(state.push).toHaveBeenCalledWith({ pathname: '/merchant/[id]', params: { id: 'm999' } });
  });
  it.each(['loading', 'error', 'removed'] as const)('does not render retained customer or merchant rows during %s', kind => {
    state.loading = kind === 'loading'; state.error = kind === 'error' ? 'unavailable' : null; state.blocked = kind === 'removed';
    for (const Screen of [CustomersScreen, MerchantsScreen]) {
      const html = renderToStaticMarkup(React.createElement(Screen));
      expect(state.list.data).toEqual([]); expect(html).not.toMatch(/data-testid="(?:customer|merchant)-card-/);
      if (kind === 'removed') expect(html).not.toContain('customer-overlay');
    }
  });
  it('preserves viewer access without write buttons, a session-scoped list key and footer clearance', () => {
    state.role = 'viewer'; state.session = 's:u:viewer';
    const html = renderToStaticMarkup(React.createElement(CustomersScreen));
    expect(html).toContain(translate('workspaceReadOnly', 'en')); expect(html).not.toContain('add-customer-header');
    expect(state.list.ListFooterComponent.props.style.height).toBeGreaterThan(112);
    const element = AppShell({ children: null, list: { testID: 'probe', data: [], renderItem: () => null } });
    expect(element.props.children[0].key).toBe('s:u:viewer');
  });
});
