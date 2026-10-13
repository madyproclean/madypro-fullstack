import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { StatusPill } from '@/components/ui/StatusPill';
import { getSiteFile, getSiteQrCode } from '@/services/api/supervision.api';
import { SiteFile } from '@/types/supervision';
import { ActionButton, DetailSection, detailStyles as styles, InfoLine } from './DetailBlocks';
import { callPhone, openDirections, sendSms } from './contact';
import { ANOMALY_LABELS, formatDayShort, toISODate } from './format';

const MISSION_STATUS: Record<string, string> = {
  PLANNED: 'À venir',
  IN_PROGRESS: 'En cours',
  NEEDS_REVIEW: 'À valider',
  COMPLETED: 'Terminée',
  NO_SHOW: 'Non réalisée',
};

// Mission du jour encore « planifiée » alors que son heure de début est passée.
const missionLabel = (status: string, startTime: string) => {
  if (status === 'PLANNED' && new Date(`${toISODate(new Date())}T${startTime}:00`) < new Date()) return 'Non démarrée';
  return MISSION_STATUS[status] ?? status;
};

type Props = {
  siteId: string;
  onOpenAgent: (agentId: string) => void;
  onOpenMission: (interventionId: string) => void;
};

/** Fiche site : itinéraire, accès et code, contact, missions du jour, checklists, incidents, QR code. */
export const SiteFileDetail: React.FC<Props> = ({ siteId, onOpenAgent, onOpenMission }) => {
  const { token } = useAuthContext();
  const [file, setFile] = useState<SiteFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [openChecklist, setOpenChecklist] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setFile(await getSiteFile(token, siteId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la fiche.');
    }
  }, [token, siteId]);

  useEffect(() => {
    setFile(null);
    setShowCode(false);
    setQr(null);
    setActionError(null);
    setOpenChecklist(null);
    load();
  }, [load]);

  const loadQr = async () => {
    if (!token) return;
    setQrLoading(true);
    try {
      setQr((await getSiteQrCode(token, siteId)).qrCodeDataUrl);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Impossible d'afficher le QR code.");
    } finally {
      setQrLoading(false);
    }
  };

  if (!file) {
    return (
      <View style={[styles.card, styles.center]}>
        {error ? <Text style={styles.errorText}>{error}</Text> : <ActivityIndicator color={theme.colors.primary} size="large" />}
      </View>
    );
  }

  const contactPhone = file.contact.phone;
  const failed = (what: string) => () => setActionError(`Impossible ${what} sur cet appareil.`);
  const openIncidents = file.incidents.filter((i) => i.status === 'NEW').length;

  return (
    <View style={styles.card}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: 4 }}>
          <Text style={styles.title}>{file.name}</Text>
          <Text style={styles.muted}>{file.address}</Text>
          {file.timeWindow ? <Text style={styles.muted}>Horaires d'intervention : {file.timeWindow}</Text> : null}
        </View>

        <View style={styles.actions}>
          <ActionButton
            primary
            label="Itinéraire"
            icon="navigate-outline"
            onPress={() => openDirections(file.address, file.latitude, file.longitude).catch(failed("d'ouvrir les cartes"))}
          />
          <ActionButton
            label="Appeler le client"
            icon="call-outline"
            disabled={!contactPhone}
            onPress={() => contactPhone && callPhone(contactPhone).catch(failed("de lancer l'appel"))}
          />
          <ActionButton
            label="SMS"
            icon="chatbox-ellipses-outline"
            disabled={!contactPhone}
            accessibilityLabel="Envoyer un SMS au contact du site"
            onPress={() => contactPhone && sendSms(contactPhone).catch(failed("d'ouvrir les SMS"))}
          />
        </View>
        {actionError ? <Text accessibilityRole="alert" style={styles.errorText}>{actionError}</Text> : null}

        <DetailSection title="Accès">
          {file.accessInstructions ? (
            <InfoLine icon="key-outline" label="Consignes" value={file.accessInstructions} />
          ) : (
            <Text style={styles.muted}>Aucune consigne d'accès renseignée.</Text>
          )}
          {file.accessCode ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <InfoLine
                  icon="keypad-outline"
                  label="Code d'accès"
                  value={showCode ? file.accessCode : '••••••'}
                  strong={showCode}
                />
              </View>
              <ActionButton
                label={showCode ? 'Masquer' : 'Afficher'}
                icon={showCode ? 'eye-off-outline' : 'eye-outline'}
                accessibilityLabel={showCode ? "Masquer le code d'accès" : "Afficher le code d'accès"}
                onPress={() => setShowCode((v) => !v)}
              />
            </View>
          ) : null}
        </DetailSection>

        <DetailSection title="Contact sur place">
          {file.contact.name || file.contact.phone || file.contact.email ? (
            <>
              {file.contact.name ? <InfoLine icon="person-outline" label="Nom" value={file.contact.name} /> : null}
              {file.contact.phone ? <InfoLine icon="call-outline" label="Téléphone" value={file.contact.phone} /> : null}
              {file.contact.email ? <InfoLine icon="mail-outline" label="Adresse e-mail" value={file.contact.email} /> : null}
            </>
          ) : (
            <Text style={styles.muted}>Aucun contact renseigné.</Text>
          )}
        </DetailSection>

        <DetailSection title={`Missions d'aujourd'hui · ${formatDayShort(toISODate(new Date()))}`}>
          {file.today.length === 0 ? <Text style={styles.muted}>Aucune mission aujourd'hui.</Text> : null}
          {file.today.map((m) => (
            <Pressable
              key={m.interventionId}
              accessibilityRole="button"
              accessibilityHint="Ouvre la mission"
              onPress={() => onOpenMission(m.interventionId)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.rowText}>
                <Text style={styles.bold}>
                  {m.startTime}–{m.endTime} · {missionLabel(m.status, m.startTime)}
                </Text>
                <Text style={styles.muted}>{m.agents.map((a) => a.name).join(', ') || 'Aucun agent affecté'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.muted} />
            </Pressable>
          ))}
        </DetailSection>

        <DetailSection title={`Incidents${openIncidents ? ` · ${openIncidents} à traiter` : ''}`}>
          {file.incidents.length === 0 ? <Text style={styles.muted}>Aucun incident ces 30 derniers jours.</Text> : null}
          {file.incidents.map((i) => (
            <View key={i.id} style={styles.row}>
              <View style={[styles.rowText, { paddingVertical: 8 }]}>
                <Text style={styles.bold}>{i.title || ANOMALY_LABELS[i.type] || 'Incident'}</Text>
                <Text style={styles.text} numberOfLines={3}>
                  {i.description}
                </Text>
                <Text style={styles.muted}>
                  {formatDayShort(toISODate(new Date(i.createdAt)))} · signalé par {i.reportedBy}
                </Text>
              </View>
              <StatusPill label={i.status === 'NEW' ? 'À traiter' : 'Résolu'} tone={i.status === 'NEW' ? 'warning' : 'success'} />
            </View>
          ))}
        </DetailSection>

        <DetailSection title="Checklists du site">
          {file.checklists.length === 0 ? <Text style={styles.muted}>Aucune checklist définie.</Text> : null}
          {file.checklists.map((c) => {
            const open = openChecklist === c.id;
            return (
              <View key={c.id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  onPress={() => setOpenChecklist(open ? null : c.id)}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.bold}>{c.label}</Text>
                    <Text style={styles.muted}>
                      {c.startTime}–{c.endTime} · {c.items.length} point{c.items.length > 1 ? 's' : ''} à vérifier
                    </Text>
                  </View>
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.muted} />
                </Pressable>
                {open
                  ? c.items.map((item) => (
                      <View key={item.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 6, paddingLeft: 8 }}>
                        <Ionicons name="square-outline" size={18} color={theme.colors.muted} />
                        <Text style={[styles.text, { flex: 1 }]}>{item.label}</Text>
                      </View>
                    ))
                  : null}
              </View>
            );
          })}
        </DetailSection>

        <DetailSection title="Agents habituels">
          {file.team.length === 0 ? <Text style={styles.muted}>Aucun agent récent.</Text> : null}
          <View style={styles.actions}>
            {file.team.map((a) => (
              <ActionButton key={a.id} label={a.name} icon="person-outline" onPress={() => onOpenAgent(a.id)} />
            ))}
          </View>
        </DetailSection>

        <DetailSection title="QR code de pointage">
          <Text style={styles.muted}>À présenter à un agent dont l'affiche du site est abîmée ou absente.</Text>
          {qr ? (
            <Image
              source={{ uri: qr }}
              accessibilityLabel={`QR code de pointage de ${file.name}`}
              style={{ width: 240, height: 240, alignSelf: 'center' }}
            />
          ) : (
            <View style={styles.actions}>
              <ActionButton
                label={qrLoading ? 'Chargement…' : 'Afficher le QR code'}
                icon="qr-code-outline"
                disabled={qrLoading}
                onPress={loadQr}
              />
            </View>
          )}
        </DetailSection>
      </ScrollView>
    </View>
  );
};
