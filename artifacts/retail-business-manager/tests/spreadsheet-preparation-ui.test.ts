import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { translate, type Language } from '../constants/i18n';
import { spreadsheetPreparationText } from '../constants/spreadsheetPreparationText';
const state = vi.hoisted(() => ({ language: 'ar' as Language, buttons: {} as Record<string, { disabled: boolean; onPress: () => void }> }));
vi.mock('react-native', () => ({
  StyleSheet: { create: (value: unknown) => value },
  View: ({ children }: any) => React.createElement('div', null, children),
  Text: ({ children }: any) => React.createElement('span', null, children),
  ActivityIndicator: () => null,
  Pressable: ({ children, disabled, testID, onPress }: any) => {
    if (testID) state.buttons[testID] = { disabled, onPress };
    return React.createElement('button', { disabled, 'data-testid': testID }, children);
  },
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('../components/AppShell', () => ({ GlassCard: ({ children }: any) => React.createElement('section', null, children) }));
vi.mock('../services/saveSpreadsheet', () => ({ saveSpreadsheet: vi.fn() }));
vi.mock('../services/spreadsheetPreparationFirestore', () => ({ spreadsheetPreparationSource: {} }));
vi.mock('../hooks/useColors', () => ({ useColors: () => ({}) }));
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ language: state.language, isRTL: state.language === 'ar', t: (key: any) => translate(key, state.language) }) }));
import { SpreadsheetExportCard } from '../components/SpreadsheetExportSettings';
const props = () => ({ available: false, canPrepare: true, count: 6, missingNames: ['Merchants'], confirming: false, busy: false,
  message: null, onStart: vi.fn(), onConfirm: vi.fn(), onCancel: vi.fn() });
describe('spreadsheet preparation controls (render contracts, not device acceptance)', () => {
  it.each(['ar', 'tr', 'en'] as const)('offers one enabled export action at 6/9 with explicit read consent in %s', language => {
    state.language = language;
    const input = props(); renderToStaticMarkup(React.createElement(SpreadsheetExportCard, input));
    expect(state.buttons['start-spreadsheet-export'].disabled).toBe(false);
    state.buttons['start-spreadsheet-export'].onPress();
    expect(input.onStart).toHaveBeenCalledTimes(1);
    expect(input.onConfirm).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(React.createElement(SpreadsheetExportCard, { ...input, confirming: true }));
    expect(html).toContain(spreadsheetPreparationText[language].confirm);
    expect(state.buttons['confirm-spreadsheet-export'].disabled).toBe(false);
  });
  it('disables the start action without a usable session', () => {
    renderToStaticMarkup(React.createElement(SpreadsheetExportCard, { ...props(), canPrepare: false }));
    expect(state.buttons['start-spreadsheet-export'].disabled).toBe(true);
  });
  it('locks duplicate starts, shows preparation progress and offers cancellation', () => {
    const input = props();
    const html = renderToStaticMarkup(React.createElement(SpreadsheetExportCard, { ...input, busy: true,
      progress: { collection: 'merchantOperations', documents: 120, completed: 8, total: 9 } }));
    expect(state.buttons['start-spreadsheet-export'].disabled).toBe(true);
    expect(html).toContain('120'); expect(html).toContain('8');
    state.buttons['cancel-spreadsheet-preparation'].onPress();
    expect(input.onCancel).toHaveBeenCalledTimes(1);
  });
});
