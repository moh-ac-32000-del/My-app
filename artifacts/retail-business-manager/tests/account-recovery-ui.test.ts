import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translate, type Language } from '../constants/i18n';
const state = vi.hoisted(() => ({ cursor: 0, slots: [] as any[], buttons: {} as Record<string,any>, inputs: {} as Record<string,any>,
  language: 'ar' as Language, reset: vi.fn(), signIn: vi.fn(), create: vi.fn(), replace: vi.fn(), haptics: vi.fn() }));
vi.mock('react', async original => ({ ...(await original<typeof import('react')>()),
  useState: (initial: any) => { const index = state.cursor++; if (!(index in state.slots)) state.slots[index] = initial;
    return [state.slots[index],(value: any) => { state.slots[index] = typeof value === 'function' ? value(state.slots[index]) : value; }]; },
  useRef: (initial: any) => { const index = state.cursor++; return state.slots[index] ?? (state.slots[index] = { current: initial }); },
}));
vi.mock('react-native', () => ({ StyleSheet: { create: (value: any) => value },
  View: ({children}:any) => React.createElement('div',null,children), Text: ({children}:any) => React.createElement('span',null,children),
  Pressable: (props:any) => { if(props.testID) state.buttons[props.testID]=props; return React.createElement('button',{'data-testid':props.testID,disabled:props.disabled},props.children); },
  TextInput: (props:any) => { state.inputs[props.testID]=props; return React.createElement('input',{'data-testid':props.testID,value:props.value,readOnly:true}); },
  ActivityIndicator: () => React.createElement('i',{'data-testid':'busy'}),
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialCommunityIcons: () => null }));
vi.mock('expo-router', () => ({ useRouter: () => ({replace:state.replace}) }));
vi.mock('expo-haptics', () => ({ notificationAsync: state.haptics, NotificationFeedbackType: { Success:'success',Error:'error' } }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({top:0,bottom:0}) }));
vi.mock('@/hooks/useColors', () => ({ useColors: () => ({}) }));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ language:state.language,setLanguage:vi.fn(),isRTL:state.language==='ar',direction:state.language==='ar'?'rtl':'ltr',t:(key:any)=>translate(key,state.language) }) }));
vi.mock('@/components/AppShell', () => ({ GlassCard: ({children}:any) => children }));
vi.mock('@/components/AppearanceSettings', () => ({ AppearanceSettings: () => null }));
vi.mock('@/services/firebase', () => ({ isFirebaseConfigured:true }));
vi.mock('@/services/firebaseAuth', () => ({ createFirebaseAccount:state.create,signInWithFirebase:state.signIn,requestFirebasePasswordReset:state.reset,
  getFirebaseAuthErrorKey:(error:any)=>error.code==='auth/network-request-failed'?'authNetworkError':'authGenericError' }));
import LoginScreen from '../app/login';
function render() { state.cursor=0; state.buttons={};state.inputs={};return renderToStaticMarkup(React.createElement(LoginScreen)); }
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
beforeEach(()=>{state.cursor=0;state.slots=[];state.language='ar';state.reset.mockReset().mockResolvedValue(undefined);state.create.mockReset();state.signIn.mockReset();state.replace.mockReset();state.haptics.mockReset().mockResolvedValue(undefined);});
describe('in-app email account recovery (handler harness, not device acceptance)',()=>{
  it.each(['ar','en','tr'] as const)('recovers by email in %s without a password or sign-in',async language=>{
    state.language=language;render();state.inputs['login-identity'].onChangeText('owner@example.com');state.inputs['login-password'].onChangeText('discard-this-draft');
    state.buttons['auth-forgot-password'].onPress();let html=render();
    expect(html).toContain(translate('authRecoveryTitle',language));expect(state.inputs['login-password']).toBeUndefined();
    state.buttons['login-submit'].onPress();await settle();html=render();
    expect(state.reset).toHaveBeenCalledExactlyOnceWith('owner@example.com',language);expect(html).toContain(translate('authResetEmailRequested',language));
    expect(state.signIn).not.toHaveBeenCalled();expect(state.create).not.toHaveBeenCalled();expect(state.replace).not.toHaveBeenCalled();
    state.buttons['auth-mode-toggle'].onPress();render();expect(state.inputs['login-password'].value).toBe('');
  });
  it('blocks empty email before the reset request',()=>{
    render();state.buttons['auth-forgot-password'].onPress();render();state.buttons['login-submit'].onPress();
    expect(render()).toContain(translate('fieldRequired','ar'));expect(state.reset).not.toHaveBeenCalled();
  });
  it('seals a pending request against repeated taps and email changes',async()=>{
    let resolve!:()=>void;state.reset.mockImplementation(()=>new Promise<void>(done=>{resolve=done;}));
    render();state.inputs['login-identity'].onChangeText('owner@example.com');state.buttons['auth-forgot-password'].onPress();render();
    const press=state.buttons['login-submit'].onPress;press();press();render();
    expect(state.reset).toHaveBeenCalledOnce();expect(state.inputs['login-identity'].editable).toBe(false);expect(state.buttons['auth-mode-toggle'].disabled).toBe(true);
    resolve();await settle();expect(render()).toContain(translate('authResetEmailRequested','ar'));
  });
  it('shows network failure and permits retry without claiming an email was sent',async()=>{
    state.reset.mockRejectedValueOnce({code:'auth/network-request-failed'});render();state.inputs['login-identity'].onChangeText('owner@example.com');state.buttons['auth-forgot-password'].onPress();render();
    state.buttons['login-submit'].onPress();await settle();let html=render();expect(html).toContain(translate('authNetworkError','ar'));expect(html).not.toContain(translate('authResetEmailRequested','ar'));
    state.buttons['login-submit'].onPress();await settle();html=render();expect(html).toContain(translate('authResetEmailRequested','ar'));expect(state.reset).toHaveBeenCalledTimes(2);
  });
});
