import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ path: '/', replace: vi.fn(), buttons: {} as Record<string, () => void> }));
vi.mock('react-native', () => ({ Platform: { OS: 'web' }, StyleSheet: { create: (value: any) => value },
  View: ({ children }: any) => React.createElement('div', null, children),
  ScrollView: ({ children }: any) => React.createElement('div', null, children),
  Text: ({ children }: any) => React.createElement('span', null, children),
  Pressable: ({ children, testID, onPress }: any) => {
    if (testID) state.buttons[testID] = onPress;
    return React.createElement('button', null, children);
  },
}));
vi.mock('expo-router', () => ({ usePathname: () => state.path, useRouter: () => ({ replace: state.replace }) }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialCommunityIcons: () => null }));
vi.mock('expo-blur', () => ({ BlurView: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('@/hooks/useColors', () => ({ useColors: () => ({}) }));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ isRTL: false, direction: 'ltr', t: (key: string) => key }) }));
vi.mock('@/context/StoreContext', () => ({ useStore: () => ({ profile: {}, workspaceRole: 'owner', isAuthenticated: true }) }));
import { AppShell } from '../components/AppShell';
beforeEach(() => { vi.clearAllMocks(); state.buttons = {}; });
describe('primary navigation avoids replacing the page already open', () => {
  it.each([['/', 'dashboard'], ['/customers', 'customers'], ['/merchants', 'merchants'], ['/archive', 'archive'], ['/settings', 'settings']])(
    'does not remount or reload %s on a repeated active-tab press', (path, label) => {
      state.path = path; renderToStaticMarkup(React.createElement(AppShell, null, 'content'));
      state.buttons[`nav-${label}`](); state.buttons[`nav-${label}`]();
      expect(state.replace).not.toHaveBeenCalled();
    },
  );
  it('still navigates to another section and returns from merchant detail to the list', () => {
    state.path = '/merchant/example'; renderToStaticMarkup(React.createElement(AppShell, null, 'content'));
    state.buttons['nav-merchants'](); expect(state.replace).toHaveBeenCalledWith('/merchants');
    state.buttons['nav-customers'](); expect(state.replace).toHaveBeenCalledWith('/customers');
  });
});
