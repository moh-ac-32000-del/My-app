import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ visible: ['TRY','USD'], options: [] as any[] }));
vi.mock('react-native', () => ({ Modal: ({ children }: any) => children, View: ({ children }: any) => React.createElement('div', null, children), Text: ({ children }: any) => React.createElement('span', null, children) }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock('@/components/KeyboardAwareScrollViewCompat', () => ({ KeyboardAwareScrollViewCompat: ({ children }: any) => children }));
vi.mock('@/components/AppShell', () => ({ GlassCard: ({ children }: any) => children }));
vi.mock('@/components/MerchantDateField', () => ({ MerchantDateField: () => null }));
vi.mock('@/components/MerchantAccountUI', () => ({ MerchantButton: () => null, MerchantField: () => null }));
vi.mock('@/components/MerchantSelect', () => ({ MerchantSelect: (props: any) => { state.options.push(props); return null; } }));
vi.mock('@/hooks/useColors', () => ({ useColors: () => ({}) }));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ language: 'ar', isRTL: true, t: (key: string) => key }) }));
vi.mock('@/context/StoreContext', () => ({ useStore: () => ({ profile: { id: 'store', currency: 'EUR', visibleCurrencies: state.visible }, activeSpaceId: 's', canWriteBusiness: true }) }));
vi.mock('@/context/CustomerContext', () => ({ useCustomers: () => ({ customers: [], canonicalSpaceId: 's', isLoading: false, error: null }) }));
vi.mock('@/hooks/useMerchantSettings', () => ({ useMerchantSettings: () => ({ data: { paymentMethods: [] } }) }));
import { MerchantCommandForm } from '../components/MerchantCommandForm';
beforeEach(() => { state.visible = ['TRY','USD']; state.options = []; });
describe('new merchant operations respect enabled currencies; history remains editable', () => {
  it.each(['purchase','payment','directPayment','opening'] as const)('offers only selected currencies for %s with a visible default', action => {
    renderToStaticMarkup(React.createElement(MerchantCommandForm, { action, command: vi.fn(), onDone: vi.fn(), onCancel: vi.fn() }));
    const currencies = state.options.find(row => row.title === 'currency');
    expect(currencies.options.map((row: any) => row.id)).toEqual(['TRY','USD']);
    expect(currencies.value).toBe('TRY');
  });
  it('does not invent an enabled currency when none is selected', () => {
    state.visible = [];
    renderToStaticMarkup(React.createElement(MerchantCommandForm, { action: 'payment', command: vi.fn(), onDone: vi.fn(), onCancel: vi.fn() }));
    expect(state.options.find(row => row.title === 'currency').options).toEqual([]);
  });
  it('retains the immutable currency of an old operation even after it is hidden', () => {
    renderToStaticMarkup(React.createElement(MerchantCommandForm, { action: 'payment', target: { id: 'old', currency: 'EUR', note: '', createdAt: '2026-10-27T12:00:00Z' } as never,
      command: vi.fn(), onDone: vi.fn(), onCancel: vi.fn() }));
    const currencies = state.options.find(row => row.title === 'currency');
    expect(currencies.options.map((row: any) => row.id)).toEqual(['EUR']);
    expect(currencies.disabled).toBe(true);
  });
});
