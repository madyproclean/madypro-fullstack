import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';
import { useI18n } from '@/i18n';
import { distanceInMeters } from '@/utils/location';

type Props = { siteName: string; address?: string; latitude?: number; longitude?: number };

/** Vitesse moyenne retenue en ville (trafic compris) pour estimer le trajet. */
const URBAN_KMH = 25;

/** Ouvre l'itinéraire vers le site dans l'application de cartes du téléphone. */
export function openDirections(address?: string, latitude?: number, longitude?: number) {
  const destination =
    typeof latitude === 'number' && typeof longitude === 'number' ? `${latitude},${longitude}` : encodeURIComponent(address ?? '');
  if (!destination) return;
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${destination}`
      : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  Linking.openURL(url).catch(() => undefined);
}

/** Trajet jusqu'à la prochaine mission : distance, durée estimée et bouton itinéraire. */
export const RouteCard: React.FC<Props> = ({ siteName, address, latitude, longitude }) => {
  const { t } = useI18n();
  const [estimate, setEstimate] = useState<{ km: number; minutes: number } | null>(null);

  useEffect(() => {
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const position = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (!position || cancelled) return;
        // Distance à vol d'oiseau majorée de 30 % pour approcher la distance par la route.
        const km = (distanceInMeters(position.coords, { latitude, longitude }) / 1000) * 1.3;
        setEstimate({ km: Math.round(km * 10) / 10, minutes: Math.max(2, Math.round((km / URBAN_KMH) * 60)) });
      } catch {
        // Pas de position : la carte affiche simplement le bouton itinéraire.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('route.title')} · ${siteName}`}
      onPress={() => openDirections(address, latitude, longitude)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <Ionicons name="navigate-circle-outline" size={32} color={theme.colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>
          {t('route.title')} · {siteName}
        </Text>
        <Text style={styles.meta}>{estimate ? t('route.estimate', { km: estimate.km, minutes: estimate.minutes }) : t('route.unknown')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    minHeight: 64,
  },
  title: { fontSize: 16, fontWeight: '700', color: theme.colors.ink },
  meta: { color: theme.colors.muted, marginTop: 2 },
});
