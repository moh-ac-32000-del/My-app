import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { runDailyClosing } from '@/services/dailyClosing';

type ClosingStatus = 'created' | 'error' | null;

export function DailyClosingAction({
  storeId,
  compact = false,
  testID,
  onClosed,
}: {
  storeId: string;
  compact?: boolean;
  testID: string;
  onClosed?: () => void;
}) {
  const colors = useColors();
  const { t, isRTL } = useI18n();
  const [isConfirmationVisible, setIsConfirmationVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [status, setStatus] = useState<ClosingStatus>(null);

  const confirmClosing = async () => {
    if (isClosing) {
      return;
    }
    setIsConfirmationVisible(false);
    setIsClosing(true);
    try {
      setStatus(await runDailyClosing(storeId));
      onClosed?.();
    } catch (error) {
      console.error('Daily archive closing failed', error);
      setStatus('error');
    } finally {
      setIsClosing(false);
    }
  };

  const statusTitle = status === 'error' ? t('somethingWentWrong') : t('closeDay');
  const statusMessage = status === 'created'
    ? t('archiveCreated')
    : t('archiveSaveError');

  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        disabled={isClosing}
        onPress={() => setIsConfirmationVisible(true)}
        style={({ pressed }) => [
          styles.button,
          compact ? styles.compactButton : styles.fullButton,
          {
            backgroundColor: colors.primary,
            flexDirection: isRTL ? 'row-reverse' : 'row',
          },
          pressed && styles.pressed,
        ]}
      >
        {isClosing
          ? <ActivityIndicator size="small" color={colors.primaryForeground} />
          : <Ionicons name="lock-closed-outline" size={compact ? 16 : 17} color={colors.primaryForeground} />}
        <Text
          style={[
            styles.buttonText,
            compact ? styles.compactButtonText : styles.fullButtonText,
            { color: colors.primaryForeground },
          ]}
        >
          {t('closeDay')}
        </Text>
      </Pressable>

      <Modal
        visible={isConfirmationVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsConfirmationVisible(false)}
      >
        <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.dialog, { backgroundColor: colors.glassStrong, borderColor: colors.border }]}>
            <Text style={[styles.dialogTitle, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('closeDay')}
            </Text>
            <Text style={[styles.dialogMessage, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('closeDayConfirm')}
            </Text>
            <View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable
                testID={`${testID}-cancel`}
                accessibilityRole="button"
                onPress={() => setIsConfirmationVisible(false)}
                style={({ pressed }) => [
                  styles.secondaryAction,
                  { borderColor: colors.border },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.actionText, { color: colors.foreground }]}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                testID={`${testID}-confirm`}
                accessibilityRole="button"
                onPress={() => void confirmClosing()}
                style={({ pressed }) => [
                  styles.primaryAction,
                  { backgroundColor: colors.primary },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.actionText, { color: colors.primaryForeground }]}>{t('closeDay')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={status !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setStatus(null)}
      >
        <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.dialog, { backgroundColor: colors.glassStrong, borderColor: colors.border }]}>
            <Text style={[styles.dialogTitle, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>
              {statusTitle}
            </Text>
            <Text style={[styles.dialogMessage, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
              {statusMessage}
            </Text>
            <Pressable
              testID={`${testID}-status-close`}
              accessibilityRole="button"
              onPress={() => setStatus(null)}
              style={({ pressed }) => [
                styles.statusAction,
                { backgroundColor: status === 'error' ? colors.destructive : colors.primary },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.actionText, { color: status === 'error' ? colors.destructiveForeground : colors.primaryForeground }]}>
                {t('close')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  fullButton: { minHeight: 45, borderRadius: 16, marginBottom: 11 },
  compactButton: { minHeight: 40, borderRadius: 13, paddingHorizontal: 10, gap: 4 },
  buttonText: { fontFamily: 'Inter_700Bold' },
  fullButtonText: { fontSize: 13 },
  compactButtonText: { fontSize: 9 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 },
  dialog: { width: '100%', maxWidth: 420, borderWidth: 1, borderRadius: 24, padding: 20 },
  dialogTitle: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  dialogMessage: { fontSize: 13, lineHeight: 21, fontFamily: 'Inter_400Regular', marginTop: 8 },
  actions: { gap: 10, marginTop: 20 },
  secondaryAction: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryAction: { flex: 1, minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusAction: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  actionText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.72 },
});