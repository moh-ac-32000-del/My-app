/** Session-memory transport identity, never an offline ledger or a success fallback.
 * One unresolved command per family must be acknowledged before a different payload is sent.
 */
export function financialCommandIntent<Command, Result>() {
  type Pending = {
    scope: string;
    payload: string;
    command: Command;
    uncertain: boolean;
    flight: Promise<Result> | null;
  };
  let pending: Pending | null = null;
  const uncertain = (cause?: unknown) => {
    const error = new Error('financialOutcomeUnconfirmed');
    Object.assign(error, { cause, code: 'financial/unconfirmed' });
    return error;
  };
  return {
    reset() {
      pending = null;
    },
    run(
      scope: string,
      payload: string,
      create: () => Command,
      send: (command: Command) => Promise<Result>,
    ): Promise<Result> {
      if (pending && pending.scope !== scope) pending = null;
      if (pending && pending.payload !== payload) return Promise.reject(uncertain());
      if (!pending) {
        let command: Command;
        try {
          command = create();
        } catch (error) {
          return Promise.reject(error);
        }
        pending = { scope, payload, command, uncertain: false, flight: null };
      }
      const current = pending;
      if (current.flight) return current.flight;
      const attempt = Promise.resolve().then(async () => {
        try {
          if (pending !== current) throw new Error('workspaceSessionChanged');
          const result = await send(current.command);
          if (pending !== current) throw new Error('workspaceSessionChanged');
          pending = null;
          return result;
        } catch (caught) {
          const code = caught && typeof caught === 'object' && 'code' in caught ? String(caught.code) : '';
          const definite = [
            'functions/invalid-argument',
            'functions/permission-denied',
            'functions/failed-precondition',
            'functions/not-found',
            'functions/resource-exhausted',
            'functions/unauthenticated',
          ].includes(code);
          if (definite && !current.uncertain) {
            if (pending === current) pending = null;
            throw caught;
          }
          // A later permission/validation failure cannot prove an earlier lost response did not commit.
          current.uncertain = true;
          throw uncertain(caught);
        } finally {
          current.flight = null;
        }
      });
      current.flight = attempt;
      return attempt;
    },
  };
}
