import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { theme } from '@/config/theme';
import { MARKER_LIVE, MARKER_STALE } from './mapColors';
import { LiveAgent, SupervisedSite } from '@/types/supervision';
import { formatAgo, STALE_SIGNAL_MINUTES } from './format';

export type SupervisionMapProps = {
  sites: SupervisedSite[];
  agents: LiveAgent[];
  selectedAgentId?: string | null;
  onSelectAgent?: (agent: LiveAgent) => void;
};

const isStale = (agent: LiveAgent) => Date.now() - new Date(agent.lastSeenAt).getTime() > STALE_SIGNAL_MINUTES * 60_000;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

/** Cadre la carte sur l'ensemble des sites et des agents (repli : Paris). */
const regionFor = (points: Array<{ latitude: number; longitude: number }>): Region => {
  if (!points.length) return { latitude: 48.8566, longitude: 2.3522, latitudeDelta: 0.2, longitudeDelta: 0.2 };
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.5),
    longitudeDelta: Math.max(0.01, (maxLng - minLng) * 1.5),
  };
};

/** Carte des sites (carrés bleus) et des agents en mission (ronds : vert, ou ambre si signal ancien). */
export const SupervisionMap: React.FC<SupervisionMapProps> = ({ sites, agents, selectedAgentId, onSelectAgent }) => {
  const mapRef = useRef<MapView>(null);
  const locatedSites = useMemo(
    () => sites.filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number'),
    [sites],
  );
  const initialRegion = useMemo(
    () =>
      regionFor([
        ...locatedSites.map((s) => ({ latitude: s.latitude as number, longitude: s.longitude as number })),
        ...agents,
      ]),
    // Cadrage initial seulement : les rafraîchissements ne doivent pas déplacer la carte sous le doigt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locatedSites.length > 0],
  );

  useEffect(() => {
    const agent = agents.find((a) => a.userId === selectedAgentId);
    if (agent) {
      mapRef.current?.animateToRegion(
        { latitude: agent.latitude, longitude: agent.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        400,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgentId]);

  return (
    <View style={styles.container}>
      <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={initialRegion} showsPointsOfInterest={false}>
        {locatedSites.map((site) => (
          <Marker
            key={`site-${site.id}`}
            coordinate={{ latitude: site.latitude as number, longitude: site.longitude as number }}
            title={site.name}
            description={site.address}
            tracksViewChanges={false}
          >
            <View style={styles.siteMarker} />
          </Marker>
        ))}
        {agents.map((agent) => {
          const stale = isStale(agent);
          const selected = agent.userId === selectedAgentId;
          return (
            <Marker
              key={`agent-${agent.userId}`}
              coordinate={{ latitude: agent.latitude, longitude: agent.longitude }}
              title={agent.agentName}
              description={`${agent.siteName} · signal ${formatAgo(agent.lastSeenAt)}`}
              onPress={() => onSelectAgent?.(agent)}
              accessibilityLabel={`${agent.agentName}, ${agent.siteName}, signal ${formatAgo(agent.lastSeenAt)}`}
              tracksViewChanges={selected}
            >
              <View
                style={[
                  styles.agentMarker,
                  { backgroundColor: stale ? MARKER_STALE : MARKER_LIVE },
                  selected && styles.agentSelected,
                ]}
              >
                <Text style={styles.agentInitials}>{initials(agent.agentName)}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border },
  siteMarker: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: theme.colors.primaryDark,
    borderWidth: 3,
    borderColor: '#fff',
  },
  agentMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentSelected: { width: 52, height: 52, borderRadius: 26, borderColor: theme.colors.ink },
  agentInitials: { color: '#fff', fontFamily: theme.fonts.bodyBold, fontSize: 15 },
});
