import { useStore } from '@/context/StoreContext';

export function useI18n() {
  const { language, setLanguage, isRTL, direction, t } = useStore();
  return { language, setLanguage, isRTL, direction, t };
}
