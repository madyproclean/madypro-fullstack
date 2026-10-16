import React from 'react';
import { Text, TextInput, View } from 'react-native';
import type { DateTimeFieldProps } from './DateTimeField';
import { fieldStyles as styles } from './DateTimeField.styles';

/** Prévisualisation web (développement) : saisie texte, le sélecteur natif n'existant pas sur le web. */
export const DateTimeField: React.FC<DateTimeFieldProps> = ({ label, mode, value, onChange }) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChange}
      placeholder={mode === 'date' ? 'AAAA-MM-JJ' : 'HH:MM'}
      style={[styles.input, styles.value]}
    />
  </View>
);
