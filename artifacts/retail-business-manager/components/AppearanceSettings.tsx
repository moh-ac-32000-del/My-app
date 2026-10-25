import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAppearance } from '@/context/AppearanceContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { appearanceText } from '@/constants/appearanceText';
import type { AppearancePreference } from '@/data/appearance';

export function AppearanceSettings() {
  const colors = useColors(), { language, isRTL } = useI18n(), appearance = useAppearance();
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const copy = appearanceText[language];
  const choose = async (preference: AppearancePreference) => {
    if (busy) return;
    setBusy(true); setFailed(false);
    try { await appearance.setPreference(preference); } catch { setFailed(true); } finally { setBusy(false); }
  };
  return <View testID="appearance-settings" style={{ gap: 10, marginBottom: 20 }}>
    <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '600', textAlign: isRTL ? 'right' : 'left' }}>{copy.title}</Text>
    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 6, flexWrap: 'wrap' }}>
      {(['system', 'light', 'dark'] as const).map(preference => <Pressable key={preference}
        testID={`appearance-${preference}`} accessibilityRole="button" accessibilityLabel={copy[preference]}
        accessibilityState={{ selected: appearance.preference === preference, disabled: busy }} disabled={busy}
        onPress={() => void choose(preference)} style={{ flexGrow: 1, minHeight: 44, justifyContent: 'center',
          borderRadius: 12, borderWidth: 1, borderColor: appearance.preference === preference ? colors.primary : colors.border,
          backgroundColor: appearance.preference === preference ? colors.accent : colors.card, paddingHorizontal: 12 }}>
        <Text style={{ textAlign: 'center', color: appearance.preference === preference ? colors.primary : colors.foreground }}>{copy[preference]}</Text>
      </Pressable>)}
    </View>
    {failed ? <Text accessibilityLiveRegion="polite" style={{ color: colors.destructive }}>{copy.error}</Text> : null}
  </View>;
}
