import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';
import { StatusPill } from '@/components/ui/StatusPill';
import { PlanningOccurrence } from '@/types/supervision';
import { ActionButton, DetailSection, detailStyles as styles, InfoLine } from './DetailBlocks';
import { formatDayLong } from './format';
import { TemplateEditorSheet } from './TemplateEditorSheet';

type Props = {
  occurrence: PlanningOccurrence;
  onChanged?: () => void;
};

/**
 * Mission prévue par le gabarit mais pas encore créée : elle le sera automatiquement peu avant son
 * début. On la modifie en modifiant le créneau du gabarit dont elle découle.
 */
export const PlannedMissionDetail: React.FC<Props> = ({ occurrence, onChanged }) => {
  const [editing, setEditing] = useState(false);
  return (
    <View style={styles.card}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.title}>{occurrence.siteName}</Text>
            <Text style={styles.muted}>
              {formatDayLong(occurrence.date)} · {occurrence.startTime} – {occurrence.endTime}
            </Text>
          </View>
          <StatusPill strong label="Prévue" tone="neutral" />
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: 12,
            borderRadius: 12,
            backgroundColor: theme.colors.primarySoft,
          }}
        >
          <Ionicons name="git-branch-outline" size={20} color={theme.colors.primaryDark} />
          <Text style={[styles.text, { flex: 1 }]}>
            Issue du gabarit « {occurrence.templateLabel} ». La mission sera créée automatiquement peu avant son début.
          </Text>
        </View>

        <DetailSection title="Prévu">
          <InfoLine icon="clipboard-outline" label="Prestation" value={occurrence.categoryLabel ?? 'Autre (sans prestation du site)'} />
          <InfoLine
            icon="people-outline"
            label="Agents"
            value={occurrence.agents.length ? occurrence.agents.map((a) => a.name).join(', ') : 'Aucun agent prévu'}
          />
        </DetailSection>

        <View style={styles.actions}>
          <ActionButton primary label="Modifier le gabarit" icon="git-branch-outline" onPress={() => setEditing(true)} />
        </View>
      </ScrollView>
      <TemplateEditorSheet
        visible={editing}
        siteId={occurrence.siteId}
        focusStopId={occurrence.stopId}
        onClose={() => setEditing(false)}
        onSaved={onChanged}
      />
    </View>
  );
};
