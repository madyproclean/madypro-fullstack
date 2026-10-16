import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/config/theme';
import { Avatar } from '../ui/Avatar';
import { StatusPill, StatusTone } from '../ui/StatusPill';

type PersonRowProps = {
  name: string;
  avatarUri?: string | null;
  /** ex. rôle, site, heure de pointage */
  subtitle?: string;
  status?: { label: string; tone: StatusTone };
  trailing?: React.ReactNode;
};

/** Ligne avatar + nom + sous-titre + pastille de statut — pattern "Today Attendance" de Crewly. */
export const PersonRow: React.FC<PersonRowProps> = ({ name, avatarUri, subtitle, status, trailing }) => {
  return (
    <View style={styles.row}>
      <Avatar uri={avatarUri} name={name} size="md" />
      <View style={styles.body}>
        <Text style={styles.name}>{name}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {status && <StatusPill label={status.label} tone={status.tone} />}
      {trailing}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    fontFamily: theme.fonts.bodySemiBold,
    color: theme.colors.ink,
  },
  subtitle: {
    fontSize: 12,
    color: theme.colors.muted,
    marginTop: 2,
  },
});
