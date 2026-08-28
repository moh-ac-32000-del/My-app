import { useStore } from '@/context/StoreContext';

export function useI18n() {
  const { language, isRTL, direction, t } = useStore();
  return { language, isRTL, direction, t };
}