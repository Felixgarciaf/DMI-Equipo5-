import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CampusOpsApplication } from '../application/incidentQueries';
import type { IncidentDetail, IncidentListItem } from '../domain/incident';

type Props = Readonly<{
  application: CampusOpsApplication;
  backendStatus: 'checking' | 'available' | 'offline';
}>;

export function IncidentExplorerScreen({ application, backendStatus }: Props) {
  const [incidents, setIncidents] = useState<readonly IncidentListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IncidentDetail | null>(null);

  useEffect(() => {
    let active = true;
    application.listIncidents().then((items) => {
      if (!active) return;
      setIncidents(items);
      setSelectedId((current) => current ?? items[0]?.id ?? null);
    });
    return () => {
      active = false;
    };
  }, [application]);

  useEffect(() => {
    let active = true;
    if (selectedId === null) {
      return () => {
        active = false;
      };
    }
    application.getIncidentDetail(selectedId).then((item) => {
      if (active) setDetail(item);
    });
    return () => {
      active = false;
    };
  }, [application, selectedId]);

  return (
    <View style={styles.screen}>
      <View accessibilityRole="summary" style={styles.header}>
        <Text style={styles.title}>CampusOps</Text>
        <Text>Incidencias del campus · entorno académico ficticio</Text>
        <Text testID="backend-status">Backend: {backendStatus}</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.listPane}>
          <Text style={styles.sectionTitle}>Incidencias</Text>
          {incidents.map((incident) => (
            <Pressable
              accessibilityRole="button"
              key={incident.id}
              onPress={() => setSelectedId(incident.id)}
              style={[styles.listItem, incident.id === selectedId && styles.selectedItem]}
            >
              <Text style={styles.itemTitle}>{incident.title}</Text>
              <Text>
                {incident.status} · {incident.priority}
              </Text>
              <Text>{incident.locationLabel}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.detailPane}>
          <Text style={styles.sectionTitle}>Detalle</Text>
          {detail ? (
            <View style={styles.detailBody}>
              <Text style={styles.itemTitle}>{detail.title}</Text>
              <Text>{detail.description}</Text>
              <Text>Categoría: {detail.category}</Text>
              <Text>Estado: {detail.status}</Text>
              <Text>Ubicación: {detail.location.label}</Text>
              <Text>Versión: {detail.version}</Text>
            </View>
          ) : (
            <Text>Seleccione una incidencia.</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, gap: 16 },
  header: { gap: 8, paddingTop: 24 },
  title: { fontSize: 24, fontWeight: '700' },
  content: { flex: 1, gap: 16 },
  listPane: { gap: 8 },
  detailPane: { gap: 8, borderTopWidth: 1, borderTopColor: '#d6dbe3', paddingTop: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  listItem: { borderWidth: 1, borderColor: '#d6dbe3', borderRadius: 8, gap: 4, padding: 12 },
  selectedItem: { borderColor: '#1d4ed8', backgroundColor: '#eff6ff' },
  itemTitle: { fontWeight: '700' },
  detailBody: { gap: 6 },
});
