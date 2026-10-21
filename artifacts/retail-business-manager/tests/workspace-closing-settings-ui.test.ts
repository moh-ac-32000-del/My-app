import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translate, type Language } from '@/constants/i18n';
import { closingSettings } from '@/data/workspaceClosing';

const state = vi.hoisted(() => ({
  cursor: 0,
  values: [] as unknown[],
  language: 'ar' as Language,
  inputs: {} as Record<string, (value: string) => void>,
  buttons: {} as Record<string, { disabled: boolean; press: () => void }>,
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = initial;
    return [
      state.values[index],
      (value: unknown) => {
        state.values[index] = value;
      },
    ];
  },
}));
vi.mock('react-native', () => ({
  View: ({ children }: any) => React.createElement('div', null, children),
  Text: ({ children }: any) => React.createElement('span', null, children),
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
  GlassCard: ({ children }: any) => React.createElement('section', null, children),
}));
vi.mock('@/components/WorkspaceControls', () => ({
  WorkspaceInput: ({ label, value, onChangeText, disabled }: any) => {
    state.inputs[label] = onChangeText;
    return React.createElement('input', { defaultValue: value, disabled, 'aria-label': label });
  },
  WorkspaceButton: ({ label, onPress, disabled, testID }: any) => {
    state.buttons[testID ?? label] = { disabled, press: onPress };
    return React.createElement('button', { disabled, 'data-testid': testID }, label);
  },
}));
import { WorkspaceClosingSettingsCard } from '@/components/WorkspaceClosingSettingsCard';

beforeEach(() => {
  state.cursor = 0;
  state.values = [];
  state.language = 'ar';
  state.inputs = {};
  state.buttons = {};
});
function render(props: React.ComponentProps<typeof WorkspaceClosingSettingsCard>) {
  state.cursor = 0;
  state.inputs = {};
  state.buttons = {};
  return renderToStaticMarkup(React.createElement(WorkspaceClosingSettingsCard, props));
}
describe('prepared closing settings (simulated handlers, not activated scheduling)', () => {
  it.each(['ar', 'en', 'tr'] as const)(
    'clearly labels preparation/manual closing in %s without inventing an enabled state',
    (language) => {
      state.language = language;
      const html = render({ settings: closingSettings(), canEdit: true, busy: false, onSave: vi.fn() });
      expect(html).toContain(translate('workspaceClosingPrepared', language));
      expect(html).toContain('Europe/Istanbul');
      expect(html).toContain('00:00');
    },
  );
  it.each(['editor', 'viewer'])('shows %s the shared settings, without edit controls', () => {
    render({ settings: closingSettings(), canEdit: false, busy: false, onSave: vi.fn() });
    expect(Object.keys(state.inputs)).toEqual([]);
    expect(Object.keys(state.buttons)).toEqual([]);
  });
  it('saves explicit zone/time/revision only; no activation or financial payload', () => {
    const save = vi.fn();
    const props = { settings: closingSettings(), canEdit: true, busy: false, onSave: save };
    render(props);
    state.inputs[translate('workspaceTimeZone', 'ar')]('America/New_York');
    state.inputs[translate('workspaceClosingTime', 'ar')]('02:30');
    render(props);
    expect(state.buttons['save-workspace-closing-settings'].disabled).toBe(false);
    state.buttons['save-workspace-closing-settings'].press();
    expect(save).toHaveBeenCalledWith({ timeZone: 'America/New_York', executionTime: '02:30', expectedRevision: 0 });
  });
  it('disables save for invalid inputs and while busy', () => {
    const props = { settings: closingSettings(), canEdit: true, busy: false, onSave: vi.fn() };
    render(props);
    state.inputs[translate('workspaceTimeZone', 'ar')]('Bad/Zone');
    expect(render(props)).toContain(translate('workspaceClosingInvalid', 'ar'));
    expect(state.buttons['save-workspace-closing-settings'].disabled).toBe(true);
    state.inputs[translate('workspaceTimeZone', 'ar')]('Europe/Istanbul');
    state.inputs[translate('workspaceClosingTime', 'ar')]('24:00');
    render(props);
    expect(state.buttons['save-workspace-closing-settings'].disabled).toBe(true);
    render({ ...props, busy: true });
    expect(state.buttons['save-workspace-closing-settings'].disabled).toBe(true);
    expect(props.onSave).not.toHaveBeenCalled();
  });
});
