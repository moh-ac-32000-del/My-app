import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/context/StoreContext';
import { automaticClosingPolicy, financialWindow, type FinancialWindow } from '@/data/automaticClosing';
import { getLocalDateKey } from '@/services/storage';

/** Display/subscription clock only. Financial writes always use the trusted server clock. No I/O. */
export function useFinancialWindow() {
  const { cloudSpace } = useStore();
  const [now, setNow] = useState(() => new Date());
  const policy = cloudSpace?.automaticClosing;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const at = new Date();
      setNow(at);
      let wait = 30000;
      try {
        const end = policy
          ? financialWindow(automaticClosingPolicy(policy), at).endAt
          : new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1).toISOString();
        wait = Math.min(wait, Math.max(50, Date.parse(end) - at.getTime() + 50));
      } catch {
        /* Invalid policies publish an error, not another financial calendar. */
      }
      timer = setTimeout(tick, wait);
    };
    tick();
    return () => clearTimeout(timer);
  }, [policy]);
  return useMemo(() => {
    try {
      const window: FinancialWindow = policy
        ? financialWindow(automaticClosingPolicy(policy), now)
        : {
            date: getLocalDateKey(now),
            startAt: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
            endAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          };
      return { window, error: null, automatic: !!policy };
    } catch {
      return { window: null, error: 'invalidAutomaticClosingPolicy', automatic: !!policy };
    }
  }, [policy, now]);
}
