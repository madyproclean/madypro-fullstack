import React, { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';
import { theme } from '@/config/theme';

/** Rafraîchissement par glissement vers le bas : renvoie le `refreshControl` d'une liste. */
export function usePullToRefresh(load: () => Promise<unknown> | void) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />;
}
