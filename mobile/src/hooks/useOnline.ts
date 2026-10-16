import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { isServerReachable, onServerReachabilityChange } from '@/services/api/client';

/**
 * `false` quand l'appareil se sait sans réseau, ou que la dernière requête n'a pas pu joindre le
 * serveur (Wi-Fi sans accès, coupure). Repasse à `true` à la première réponse reçue.
 */
export function useOnline() {
  const [connected, setConnected] = useState(true);
  const [reachable, setReachable] = useState(isServerReachable());
  useEffect(() => NetInfo.addEventListener((state) => setConnected(state.isConnected !== false)), []);
  useEffect(() => onServerReachabilityChange(setReachable), []);
  return connected && reachable;
}
