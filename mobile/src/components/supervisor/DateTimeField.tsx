import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';
import { formatDayLong, toISODate } from './format';
import { fieldStyles } from './DateTimeField.styles';

export type DateTimeFieldProps = {
  label: string;
  mode: 'date' | 'time';
  /** "YYYY-MM-DD" (date) ou "HH:mm" (heure). */
  value: string;
  onChange: (value: string) => void;
};

const toDate = (mode: 'date' | 'time', value: string) => {
  if (mode === 'date') return value ? new Date(`${value}T12:00:00`) : new Date();
  const [h, m] = (value || '08:00').split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
};

const fromDate = (mode: 'date' | 'time', date: Date) =>
  mode === 'date'
    ? toISODate(date)
    : `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;

/** Champ date ou heure avec le sélecteur natif (Android : boîte de dialogue ; iOS : sous le champ). */
export const DateTimeField: React.FC<DateTimeFieldProps> = ({ label, mode, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const display = value ? (mode === 'date' ? formatDayLong(value) : value) : 'Choisir';

  const handle = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== 'ios') setOpen(false);
    if (event.type === 'set' && date) onChange(fromDate(mode, date));
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} : ${display}`}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.input, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.value}>{display}</Text>
        <Ionicons name={mode === 'date' ? 'calendar-outline' : 'time-outline'} size={20} color={theme.colors.muted} />
      </Pressable>
      {open ? (
        <DateTimePicker
          value={toDate(mode, value)}
          mode={mode}
          is24Hour
          locale="fr-FR"
          minuteInterval={mode === 'time' ? 5 : undefined}
          display={Platform.OS === 'ios' ? (mode === 'date' ? 'inline' : 'spinner') : 'default'}
          onChange={handle}
        />
      ) : null}
    </View>
  );
};

const styles = fieldStyles;
