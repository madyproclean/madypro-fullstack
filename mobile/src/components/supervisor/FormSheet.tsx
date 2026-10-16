import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';

type Props = {
  visible: boolean;
  title: string;
  /** Rappel affiché sous le titre (ex. « Votre demande sera envoyée à l'administrateur »). */
  hint?: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitting?: boolean;
  canSubmit?: boolean;
  error?: string | null;
  /** Fiche de consultation : un seul bouton (« Fermer »), pas d'« Annuler ». */
  readOnly?: boolean;
  children: React.ReactNode;
};

/** Formulaire en fenêtre centrée (tablette), avec Annuler / action principale en bas. */
export const FormSheet: React.FC<Props> = ({
  visible,
  title,
  hint,
  onClose,
  onSubmit,
  submitLabel,
  submitting,
  canSubmit = true,
  error,
  readOnly,
  children,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
      <View style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {hint ? <Text style={styles.hint}>{hint}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} style={styles.close}>
            <Ionicons name="close" size={24} color={theme.colors.ink} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <View style={styles.footer}>
          {readOnly ? null : (
            <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
              <Text style={styles.buttonLabel}>Annuler</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit || !!submitting }}
            onPress={canSubmit && !submitting ? onSubmit : undefined}
            style={({ pressed }) => [
              styles.button,
              styles.primary,
              (!canSubmit || submitting) && styles.disabled,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.buttonLabel, { color: '#fff' }]}>{submitting ? 'Envoi…' : submitLabel}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>
);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,22,32,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '90%',
    backgroundColor: theme.colors.cream,
    borderRadius: 24,
    padding: 24,
    gap: 16,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1, gap: 4 },
  title: { fontFamily: theme.fonts.display, fontSize: 26, color: theme.colors.ink },
  hint: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  body: { gap: 16 },
  error: { fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.status.absent },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  button: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.shell,
    justifyContent: 'center',
  },
  primary: { backgroundColor: theme.colors.primaryDark, borderColor: theme.colors.primaryDark },
  disabled: { opacity: 0.5 },
  buttonLabel: { fontFamily: theme.fonts.bodySemiBold, fontSize: 16, color: theme.colors.ink },
});
