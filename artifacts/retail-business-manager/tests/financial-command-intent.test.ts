import { describe, expect, it, vi } from 'vitest';
import { financialCommandIntent } from '@/data/financialCommandIntent';
import { createCashTransaction, createDebt } from '@/services/storage';

describe('session transport retry identity without offline persistence', () => {
  it('does not seal a locally invalid draft or send it to the server', async () => {
    const intent = financialCommandIntent<string, string>(),
      send = vi.fn().mockResolvedValue('ok');
    await expect(
      intent.run(
        'scope',
        'bad',
        () => {
          throw new Error('dueDateInvalid');
        },
        send,
      ),
    ).rejects.toThrow('dueDateInvalid');
    expect(send).not.toHaveBeenCalled();
    expect(await intent.run('scope', 'good', () => 'valid-id', send)).toBe('ok');
  });
  it('reuses the identical debt ID, dates and payload after a lost acknowledgement', async () => {
    const intent = financialCommandIntent<ReturnType<typeof createDebt>, string>();
    const create = vi.fn(() => createDebt('store', 'customer', { amount: 12.005, currency: 'TRY' }));
    const send = vi.fn().mockRejectedValueOnce({ code: 'functions/unavailable' }).mockResolvedValue('acknowledged');
    await expect(intent.run('scope', 'payload', create, send)).rejects.toThrow('financialOutcomeUnconfirmed');
    await expect(intent.run('scope', 'payload', create, send)).resolves.toBe('acknowledged');
    expect(create).toHaveBeenCalledOnce();
    expect(send.mock.calls[1][0]).toBe(send.mock.calls[0][0]);
    await intent.run('scope', 'payload', create, send);
    expect(create).toHaveBeenCalledTimes(2); // A new confirmed identical business operation remains possible.
  });
  it('reuses cash identity and prevents parallel duplicate sends', async () => {
    const intent = financialCommandIntent<ReturnType<typeof createCashTransaction>, string>();
    const create = vi.fn(() => createCashTransaction('store', { amount: 50, currency: 'TRY', type: 'cash_in' }));
    let resolve!: (value: string) => void;
    const send = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    const first = intent.run('scope', 'cash', create, send),
      second = intent.run('scope', 'cash', create, send);
    await Promise.resolve();
    resolve('confirmed');
    expect(await first).toBe('confirmed');
    expect(await second).toBe('confirmed');
    expect(send).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
  });
  it('blocks changing customer, currency, date or amount while an old outcome is uncertain', async () => {
    const intent = financialCommandIntent<{ id: string }, string>(),
      create = vi.fn(() => ({ id: 'same' }));
    const send = vi.fn().mockRejectedValue({ code: 'functions/deadline-exceeded' });
    await expect(intent.run('scope', 'original', create, send)).rejects.toThrow();
    await expect(intent.run('scope', 'changed', create, send)).rejects.toThrow('financialOutcomeUnconfirmed');
    expect(send).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
  });
  it.each([
    'invalid-argument',
    'permission-denied',
    'failed-precondition',
    'not-found',
    'resource-exhausted',
    'unauthenticated',
  ])('allows correction after an initial definite %s rejection', async (code) => {
    const intent = financialCommandIntent<string, string>();
    const create = vi.fn().mockReturnValueOnce('first').mockReturnValue('second');
    const send = vi
      .fn()
      .mockRejectedValueOnce({ code: `functions/${code}` })
      .mockResolvedValue('ok');
    await expect(intent.run('scope', 'original', create, send)).rejects.toMatchObject({ code: `functions/${code}` });
    expect(await intent.run('scope', 'changed', create, send)).toBe('ok');
    expect(create).toHaveBeenCalledTimes(2);
  });
  it('never discards the original unknown operation after a later permission rejection', async () => {
    const intent = financialCommandIntent<string, string>(),
      create = vi.fn(() => 'original-id');
    const send = vi
      .fn()
      .mockRejectedValueOnce({ code: 'functions/unavailable' })
      .mockRejectedValueOnce({ code: 'functions/permission-denied' })
      .mockResolvedValue('receipt');
    await expect(intent.run('scope', 'original', create, send)).rejects.toThrow();
    await expect(intent.run('scope', 'original', create, send)).rejects.toMatchObject({
      message: 'financialOutcomeUnconfirmed',
      code: 'financial/unconfirmed',
    });
    await expect(intent.run('scope', 'changed', create, send)).rejects.toThrow('financialOutcomeUnconfirmed');
    expect(await intent.run('scope', 'original', create, send)).toBe('receipt');
    expect(create).toHaveBeenCalledOnce();
  });
  it('ignores old-session acknowledgements without clearing a new-session request', async () => {
    const intent = financialCommandIntent<string, string>();
    let old!: (value: string) => void, next!: (value: string) => void;
    const send = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((done) => {
            old = done;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<string>((done) => {
            next = done;
          }),
      );
    const first = intent.run('scope-a', 'same', () => 'old-id', send);
    const rejected = expect(first).rejects.toThrow('financialOutcomeUnconfirmed');
    await Promise.resolve();
    intent.reset();
    const second = intent.run('scope-b', 'same', () => 'new-id', send);
    await Promise.resolve();
    old('old-ack');
    await rejected;
    const duplicate = intent.run('scope-b', 'same', () => 'must-not-run', send);
    next('new-ack');
    expect(await second).toBe('new-ack');
    expect(await duplicate).toBe('new-ack');
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('does not dispatch a queued command after its scope has already been reset', async () => {
    const intent = financialCommandIntent<string, string>(),
      send = vi.fn().mockResolvedValue('ok');
    const first = intent.run('old', 'body', () => 'old', send);
    intent.reset();
    await expect(first).rejects.toThrow('financialOutcomeUnconfirmed');
    expect(send).not.toHaveBeenCalled();
  });
  it('can retry a synchronously thrown transport failure instead of retaining a rejected promise forever', async () => {
    const intent = financialCommandIntent<string, string>();
    const send = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('network');
      })
      .mockResolvedValue('ok');
    await expect(intent.run('scope', 'body', () => 'id', send)).rejects.toThrow();
    expect(await intent.run('scope', 'body', () => 'must-not-replace-id', send)).toBe('ok');
    expect(send.mock.calls.map((call) => call[0])).toEqual(['id', 'id']);
  });
});
