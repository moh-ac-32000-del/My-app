import { merchantOperationDate } from './merchantSettings';
import type { OperationCorrectionMetadata } from '../types/business';

/** Display metadata only. No status field here changes account arithmetic. */
export function operationCorrectionMetadata(value: Record<string, unknown>): OperationCorrectionMetadata {
  const result: OperationCorrectionMetadata = {};
  if (value.operationDate !== undefined) result.operationDate = merchantOperationDate(value.operationDate);
  if (value.cancelled !== undefined) {
    if (typeof value.cancelled !== 'boolean') throw new Error('invalidOperationCorrectionMetadata');
    result.cancelled = value.cancelled;
  }
  if (value.amendmentRevision !== undefined) {
    if (!Number.isSafeInteger(value.amendmentRevision) || (value.amendmentRevision as number) < 1) throw new Error('invalidOperationCorrectionMetadata');
    result.amendmentRevision = value.amendmentRevision as number;
  }
  if (value.customerAmendmentId !== undefined) {
    if (typeof value.customerAmendmentId !== 'string' || !value.customerAmendmentId || value.customerAmendmentId.length > 200 || value.customerAmendmentId.includes('/'))
      throw new Error('invalidOperationCorrectionMetadata');
    result.customerAmendmentId = value.customerAmendmentId;
  }
  return result;
}
