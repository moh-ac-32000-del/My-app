import { describe, expect, it } from 'vitest';
import ar, { translate } from '../constants/i18n';
import { spreadsheetPreparationText } from '../constants/spreadsheetPreparationText';
import { exportReportLabels } from '../constants/exportLabels';
import { merchantStatementText } from '../constants/merchantStatementText';

describe('reader-facing language', () => {
  it.each(['ar', 'en', 'tr'] as const)('keeps provider names out of %s UI and report labels', language => {
    const values = Object.keys(ar).map(key => translate(key as keyof typeof ar, language));
    expect(JSON.stringify([...values, spreadsheetPreparationText[language],
      exportReportLabels[language], merchantStatementText[language]])).not.toMatch(/Firebase|Firestore/i);
  });
  it('retains the important limitations without provider branding', () => {
    expect(translate('pushTestAccepted', 'en')).toContain('acceptance does not prove delivery');
    expect(translate('cloudBackupRestoreUnavailable', 'en')).toContain('not a complete backup');
    expect(spreadsheetPreparationText.en.confirm).toContain('usage and costs');
    expect(spreadsheetPreparationText.en.confirm).toContain('check access');
    expect(JSON.stringify(merchantStatementText.en)).toContain('partial statements cannot be exported');
  });
});
