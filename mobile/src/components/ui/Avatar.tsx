import React from 'react';
import { Image, ImageStyle, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { theme } from '@/config/theme';

type AvatarSize = 'sm' | 'md' | 'lg';

const SIZES: Record<AvatarSize, number> = { sm: 28, md: 36, lg: 48 };

type AvatarProps = {
  uri?: string | null;
  name: string;
  size?: AvatarSize;
  style?: ViewStyle;
};

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export const Avatar: React.FC<AvatarProps> = ({ uri, name, size = 'md', style }) => {
  const dimension = SIZES[size];
  const boxStyle = { width: dimension, height: dimension, borderRadius: dimension / 2 };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.base, boxStyle, style] as ImageStyle[]}
        accessibilityLabel={name}
      />
    );
  }

  return (
    <View style={[styles.base, styles.fallback, boxStyle, style]}>
      <Text style={[styles.initials, { fontSize: dimension * 0.38 }]}>{initials(name) || '?'}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  fallback: {
    backgroundColor: theme.colors.badge.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: theme.fonts.bodySemiBold,
    color: theme.colors.badge.blue,
  },
});
