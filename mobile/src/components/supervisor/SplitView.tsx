import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/config/theme';
import { useLayout } from '@/hooks/useLayout';

type Props = {
  list: React.ReactNode;
  /** Détail de l'élément sélectionné ; `null` quand rien n'est sélectionné. */
  detail: React.ReactNode | null;
  /** Affiché à droite en paysage quand rien n'est sélectionné. */
  emptyDetail?: React.ReactNode;
  /** Fermeture du détail en portrait (retour à la liste). */
  onCloseDetail: () => void;
  detailTitle?: string;
};

/**
 * Liste et détail : côte à côte sur tablette en paysage (liste ≈ 40 %), détail en plein écran
 * par-dessus la liste en portrait ou sur petit écran.
 */
export const SplitView: React.FC<Props> = ({ list, detail, emptyDetail, onCloseDetail, detailTitle }) => {
  const { isWide } = useLayout();

  if (isWide) {
    return (
      <View style={styles.row}>
        <View style={styles.list}>{list}</View>
        <View style={styles.detail}>{detail ?? emptyDetail ?? null}</View>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      {list}
      <Modal visible={detail != null} animationType="slide" onRequestClose={onCloseDetail} supportedOrientations={['portrait', 'landscape']}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retour à la liste"
              onPress={onCloseDetail}
              style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="chevron-back" size={24} color={theme.colors.ink} />
              <Text style={styles.backLabel}>Retour</Text>
            </Pressable>
            {detailTitle ? (
              <Text numberOfLines={1} style={styles.sheetTitle}>
                {detailTitle}
              </Text>
            ) : null}
          </View>
          <View style={styles.fill}>{detail}</View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flex: 1, flexDirection: 'row', gap: 20 },
  list: { flex: 2, minWidth: 320 },
  detail: { flex: 3 },
  sheet: { flex: 1, backgroundColor: theme.colors.cream },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, minHeight: 56 },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingRight: 8 },
  backLabel: { fontFamily: theme.fonts.bodyMedium, fontSize: 17, color: theme.colors.ink },
  sheetTitle: { flex: 1, fontFamily: theme.fonts.bodySemiBold, fontSize: 17, color: theme.colors.ink },
});
