import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';

/**
 * Appelle `load` à l'affichage de l'écran, puis toutes les `intervalMs` tant que l'écran est
 * affiché et l'application au premier plan, et au retour au premier plan.
 */
export function useFocusPolling(load: () => void, intervalMs = 30_000) {
  const focused = useIsFocused();

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') load();
      }, intervalMs);
      return () => clearInterval(timer);
    }, [load, intervalMs]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && focused) load();
    });
    return () => sub.remove();
  }, [load, focused]);
}
