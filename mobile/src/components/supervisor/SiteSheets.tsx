import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { createSiteInspection, getQualityOverview, getSiteHistory, messageSiteTeam } from '@/services/api/supervision.api';
import { QualityItem, QualityRating, SiteHistory } from '@/types/supervision';
import { FormSheet } from './FormSheet';
import { formatDayShort } from './format';

const STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Prévue',
  IN_PROGRESS: 'En cours',
  NEEDS_REVIEW: 'À valider',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
  NO_SHOW: 'Non faite',
};

export const scoreColor = (score: number) =>
  score >= 80 ? theme.colors.status.onTime : score >= 60 ? theme.colors.status.late : theme.colors.status.absent;

type SiteProps = { siteId: string | null; siteName?: string; onClose: () => void };

/** Dernières missions du site (statut, agents, photos, anomalies) et contrôles qualité. */
export const SiteHistorySheet: React.FC<SiteProps> = ({ siteId, siteName, onClose }) => {
  const { token } = useAuthContext();
  const [data, setData] = useState<SiteHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!siteId || !token) return;
    setData(null);
    setError(null);
    getSiteHistory(token, siteId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Historique indisponible.'));
  }, [siteId, token]);

  return (
    <FormSheet
      visible={siteId !== null}
      title={`Historique · ${siteName ?? ''}`}
      hint="30 dernières missions et contrôles qualité"
      onClose={onClose}
      onSubmit={onClose}
      submitLabel="Fermer"
      readOnly
      error={error}
    >
      {!data && !error ? <ActivityIndicator color={theme.colors.primary} /> : null}
      {data ? (
        <>
          <Text accessibilityRole="header" style={styles.blockTitle}>
            Contrôles qualité
          </Text>
          {data.inspections.length === 0 ? <Text style={styles.muted}>Aucun contrôle pour l’instant.</Text> : null}
          {data.inspections.map((q) => (
            <View key={q.id} style={styles.card}>
              <Text style={[styles.bold, { color: scoreColor(q.score) }]}>
                {q.score} / 100 · {formatDayShort(q.createdAt.slice(0, 10))} · {q.inspectorName}
              </Text>
              {q.items
                .filter((i) => i.rating !== 'GOOD')
                .map((i) => (
                  <Text key={i.label} style={styles.muted}>
                    {i.rating === 'POOR' ? 'À reprendre' : 'Moyen'} : {i.label}
                    {i.comment ? ` (${i.comment})` : ''}
                  </Text>
                ))}
              {q.comment ? <Text style={styles.line}>{q.comment}</Text> : null}
            </View>
          ))}
          <Text accessibilityRole="header" style={styles.blockTitle}>
            Missions
          </Text>
          {data.missions.length === 0 ? <Text style={styles.muted}>Aucune mission passée.</Text> : null}
          {data.missions.map((m) => (
            <View key={m.id} style={styles.card}>
              <Text style={styles.bold}>
                {formatDayShort(m.date)} · {m.startTime} – {m.endTime} · {STATUS_LABELS[m.status] ?? m.status}
              </Text>
              <Text style={styles.muted}>
                {[m.prestation, m.agents.join(', ') || 'aucun agent', m.photoCount ? `${m.photoCount} photo(s)` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {m.anomalies.map((a) => (
                <Text key={a.id} style={[styles.line, { color: a.status === 'NEW' ? theme.colors.status.absent : theme.colors.muted }]}>
                  Anomalie : {a.title}
                  {a.status === 'NEW' ? ' (à traiter)' : ' (traitée)'}
                </Text>
              ))}
              {m.observation ? <Text style={styles.line}>« {m.observation} »</Text> : null}
            </View>
          ))}
        </>
      ) : null}
    </FormSheet>
  );
};

const RATINGS: Array<{ value: QualityRating; label: string; color: string }> = [
  { value: 'GOOD', label: 'Bien', color: theme.colors.status.onTime },
  { value: 'AVERAGE', label: 'Moyen', color: theme.colors.status.late },
  { value: 'POOR', label: 'À reprendre', color: theme.colors.status.absent },
];

/** Contrôle qualité sur place : chaque critère noté Bien / Moyen / À reprendre, commentaire, photos. */
export const QualityInspectionSheet: React.FC<SiteProps & { onSaved?: () => void }> = ({ siteId, siteName, onClose, onSaved }) => {
  const { token } = useAuthContext();
  const { showToast } = useToast();
  const [criteria, setCriteria] = useState<string[]>([]);
  const [ratings, setRatings] = useState<Record<string, QualityRating | undefined>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!siteId || !token) return;
    setRatings({});
    setNotes({});
    setComment('');
    setPhotos([]);
    setError(null);
    getQualityOverview(token)
      .then((o) => setCriteria(o.criteria))
      .catch(() => setError('Grille de contrôle indisponible.'));
  }, [siteId, token]);

  const rated = criteria.filter((c) => ratings[c]);
  const score = rated.length
    ? Math.round(rated.reduce((n, c) => n + (ratings[c] === 'GOOD' ? 100 : ratings[c] === 'AVERAGE' ? 50 : 0), 0) / rated.length)
    : null;

  const addPhoto = async () => {
    const options = { quality: 0.4, base64: true, allowsEditing: false } as const;
    let result: ImagePicker.ImagePickerResult;
    if (Platform.OS === 'web') {
      result = await ImagePicker.launchImageLibraryAsync(options);
    } else {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
        setError('Autorisez l’appareil photo pour joindre une photo.');
        return;
      }
      result = await ImagePicker.launchCameraAsync(options);
    }
    const asset = !result.canceled ? result.assets?.[0] : undefined;
    if (asset?.base64) setPhotos((prev) => [...prev, `data:image/jpeg;base64,${asset.base64}`].slice(0, 6));
    else if (asset?.uri?.startsWith('data:')) setPhotos((prev) => [...prev, asset.uri].slice(0, 6));
  };

  const submit = async () => {
    if (!token || !siteId || !rated.length) return;
    setSubmitting(true);
    setError(null);
    try {
      const items: QualityItem[] = rated.map((label) => ({ label, rating: ratings[label]!, comment: notes[label]?.trim() || undefined }));
      const result = await createSiteInspection(token, siteId, { items, comment: comment.trim() || undefined, photos });
      showToast('Contrôle enregistré', `Note du site : ${result.score} / 100`, 'success');
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le contrôle n'a pas pu être enregistré.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormSheet
      visible={siteId !== null}
      title={`Contrôle qualité · ${siteName ?? ''}`}
      hint={score === null ? 'Notez chaque point vérifié sur place.' : `Note actuelle : ${score} / 100`}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Enregistrer le contrôle"
      submitting={submitting}
      canSubmit={rated.length > 0}
      error={error}
    >
      {criteria.map((label) => (
        <View key={label} style={styles.card}>
          <Text style={styles.bold}>{label}</Text>
          <View style={styles.chips}>
            {RATINGS.map((r) => {
              const on = ratings[label] === r.value;
              return (
                <Pressable
                  key={r.value}
                  accessibilityRole="radio"
                  accessibilityLabel={`${label} : ${r.label}`}
                  accessibilityState={{ checked: on }}
                  onPress={() => setRatings((prev) => ({ ...prev, [label]: on ? undefined : r.value }))}
                  style={[styles.chip, on && { backgroundColor: r.color, borderColor: r.color }]}
                >
                  <Text style={[styles.chipText, on && { color: '#fff' }]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {ratings[label] && ratings[label] !== 'GOOD' ? (
            <TextInput
              accessibilityLabel={`Remarque sur ${label}`}
              placeholder="Ce qui ne va pas"
              value={notes[label] ?? ''}
              onChangeText={(text) => setNotes((prev) => ({ ...prev, [label]: text }))}
              style={styles.input}
            />
          ) : null}
        </View>
      ))}
      <TextInput
        accessibilityLabel="Commentaire général"
        placeholder="Commentaire général (facultatif)"
        value={comment}
        onChangeText={setComment}
        multiline
        style={[styles.input, { minHeight: 80 }]}
      />
      <View style={styles.chips}>
        {photos.map((p, i) => (
          <Pressable key={i} accessibilityLabel="Retirer la photo" onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}>
            <Image source={{ uri: p }} style={styles.photo} />
          </Pressable>
        ))}
        {photos.length < 6 ? (
          <Pressable accessibilityRole="button" onPress={addPhoto} style={[styles.chip, { flexDirection: 'row', gap: 6 }]}>
            <Ionicons name="camera-outline" size={20} color={theme.colors.ink} />
            <Text style={styles.chipText}>Ajouter une photo</Text>
          </Pressable>
        ) : null}
      </View>
    </FormSheet>
  );
};

/** Message à toute l'équipe du site (agents du gabarit et des missions récentes). */
export const SiteMessageSheet: React.FC<SiteProps> = ({ siteId, siteName, onClose }) => {
  const { token } = useAuthContext();
  const { showToast } = useToast();
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBody('');
    setError(null);
  }, [siteId]);

  const submit = async () => {
    if (!token || !siteId || body.trim().length < 2) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await messageSiteTeam(token, siteId, body.trim());
      showToast('Message envoyé', `${result.recipients.length} agent(s) : ${result.recipients.map((r) => r.name).join(', ')}`, 'success');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le message n'a pas pu être envoyé.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormSheet
      visible={siteId !== null}
      title={`Écrire à l’équipe · ${siteName ?? ''}`}
      hint="Chaque agent qui travaille sur ce site reçoit le message dans sa messagerie."
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Envoyer"
      submitting={submitting}
      canSubmit={body.trim().length >= 2}
      error={error}
    >
      <TextInput
        accessibilityLabel="Message"
        placeholder="Ex. : le code d'accès change à partir de lundi"
        value={body}
        onChangeText={setBody}
        multiline
        style={[styles.input, { minHeight: 120 }]}
      />
    </FormSheet>
  );
};

const styles = StyleSheet.create({
  blockTitle: { fontFamily: theme.fonts.bodyBold, fontSize: 17, color: theme.colors.ink },
  card: { gap: 6, padding: 14, borderRadius: 14, backgroundColor: theme.colors.shell, borderWidth: 1, borderColor: theme.colors.border },
  bold: { fontFamily: theme.fonts.bodySemiBold, fontSize: 15, color: theme.colors.ink },
  line: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.ink },
  muted: { fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.cream,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: { fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.ink },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.shell,
    padding: 12,
    fontFamily: theme.fonts.body,
    fontSize: 16,
    color: theme.colors.ink,
    textAlignVertical: 'top',
  },
  photo: { width: 72, height: 72, borderRadius: 10 },
});
