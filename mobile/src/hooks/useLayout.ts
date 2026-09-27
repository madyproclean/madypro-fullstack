import { useWindowDimensions } from 'react-native';

/** Largeur à partir de laquelle liste et détail s'affichent côte à côte (tablette en paysage). */
export const SPLIT_MIN_WIDTH = 900;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    /** Deux panneaux côte à côte. */
    isWide: width >= SPLIT_MIN_WIDTH,
    /** Appareil de type tablette, quelle que soit l'orientation. */
    isTablet: Math.min(width, height) >= 600,
  };
}
