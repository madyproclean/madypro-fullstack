export const theme = {
  colors: {
    ink: '#0B1620',
    inkLight: '#7B8781',
    muted: '#5C6864',
    primary: '#0f98eb',
    /** Bleu foncé : fonds de boutons sous texte blanc (contraste suffisant, contrairement à primary). */
    primaryDark: '#1B5CA0',
    border: '#DDE5EF',
    primarySoft: '#E3F4FC',
    cream: '#F4F8FC',
    shell: '#FFFFFF',
    sage: '#D3EAE4',
    clay: '#D7E2EC',
    accent: '#CFE8F7',
    danger: '#C24A3E',
    status: {
      onTime: '#2E8B57',
      onTimeSoft: '#E1F1E7',
      late: '#B9791E',
      lateSoft: '#F6E9D2',
      absent: '#C24A3E',
      absentSoft: '#F3DEDE',
      pending: '#7B8781',
      pendingSoft: '#E4E9E6',
    },
    // Tons de badge KPI — décoratifs/catégoriels, en miroir de
    // frontend/src/styles/tokens.scss (--color-badge-*) pour garder les deux
    // plateformes visuellement cohérentes.
    badge: {
      orange: '#C2610C',
      orangeSoft: '#FDECDA',
      blue: '#0f98eb',
      blueSoft: '#E3F4FC',
      yellow: '#9C7A18',
      yellowSoft: '#FFF8DF',
      green: '#2E8B57',
      greenSoft: '#E1F1E7',
      red: '#C24A3E',
      redSoft: '#F3DEDE',
    },
  },
  fonts: {
    display: 'FjallaOne_400Regular',
    body: 'Cabin_400Regular',
    bodyMedium: 'Cabin_500Medium',
    bodySemiBold: 'Cabin_600SemiBold',
    bodyBold: 'Cabin_700Bold',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radii: {
    pill: 999,
    lg: 28,
    md: 20,
  },
};
