import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { CampusOpsApplication } from '../application/incidentQueries';
import type { LocationProviderPort } from '../domain/ports';
import type { IncidentDetail, IncidentListItem } from '../domain/incident';
import type { IncidentLocation } from '../contracts';

type Props = Readonly<{
  application: CampusOpsApplication;
  backendStatus: 'checking' | 'available' | 'offline';
  locationProvider: LocationProviderPort;
}>;

export function IncidentExplorerScreen({
  application,
  backendStatus,
  locationProvider,
}: Props) {
  const [incidents, setIncidents] = useState<readonly IncidentListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [detailNotFound, setDetailNotFound] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [manualLocationLabel, setManualLocationLabel] = useState('');
  const [capturedLocation, setCapturedLocation] = useState<IncidentLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);

  async function resolveLocation(useManualOnly: boolean): Promise<void> {
    const manualLabel = manualLocationLabel.trim();
    if (!manualLabel) {
      setLocationError('Escribe una referencia manual válida antes de continuar.');
      setCapturedLocation(null);
      return;
    }

    setLocationError(null);
    setIsResolvingLocation(true);
    try {
      const location = await locationProvider.resolveIncidentLocation({
        query: useManualOnly ? '' : locationQuery.trim(),
        manualLabel,
      });
      setCapturedLocation(location);
    } catch {
      setCapturedLocation(null);
      setLocationError('No fue posible resolver la ubicación. Revisa la conexión e inténtalo nuevamente.');
    } finally {
      setIsResolvingLocation(false);
    }
  }

  useEffect(() => {
    let active = true;

    application.listIncidents().then((items) => {
      if (!active) return;

      setIncidents(items);
      setSelectedId((current) => current ?? items[0]?.id ?? null);
      setIsLoading(false);
    }).catch(() => {
      if (!active) return;
      setStorageError(true);
      setIsLoading(false);
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
      if (!active) return;

      setDetail(item);
      setDetailNotFound(item === null);
    }).catch(() => {
      if (!active) return;
      setDetail(null);
      setStorageError(true);
    });

    return () => {
      active = false;
    };
  }, [application, selectedId]);

  return (
    <View style={styles.screen}>
      {storageError && <Text accessibilityRole="alert">No fue posible recuperar los datos locales. Vuelve a abrir la aplicacion para reintentar.</Text>}
      <View accessibilityRole="summary" style={styles.header}>
        <Text style={styles.title}>CampusOps</Text>
        <Text>
          Incidencias del campus · entorno académico ficticio
        </Text>
        <Text testID="backend-status">
          Backend: {backendStatus}
        </Text>
      </View>

      <View style={styles.content}>
        <View style={styles.listPane}>
          <Text style={styles.sectionTitle}>Incidencias</Text>

          {isLoading ? (
            <Text>Cargando incidencias...</Text>
          ) : incidents.length === 0 ? (
            <Text>No hay incidencias disponibles.</Text>
          ) : (
            incidents.map((incident) => (
              <Pressable
                accessibilityRole="button"
                key={incident.id}
                onPress={() => {
                  setSelectedId(incident.id);
                  setCapturedLocation(null);
                  setLocationError(null);
                }}
                style={[
                  styles.listItem,
                  incident.id === selectedId && styles.selectedItem,
                ]}
              >
                <Text style={styles.itemTitle}>
                  {incident.title}
                </Text>

                <Text>
                  {incident.status} · {incident.priority}
                </Text>

                <Text>{incident.locationLabel}</Text>
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.detailPane}>
          <Text style={styles.sectionTitle}>Detalle</Text>

          {detail ? (
            <View style={styles.detailBody}>
              <Text style={styles.itemTitle}>
                {detail.title}
              </Text>

              <Text>{detail.description}</Text>

              <Text>
                Categoría: {detail.category}
              </Text>

              <Text>
                Estado: {detail.status}
              </Text>

              <Text>
                Ubicación: {(capturedLocation ?? detail.location).label}
              </Text>

              <Text>
                Versión: {detail.version}
              </Text>
            </View>
          ) : detailNotFound ? (
            <Text>No se encontró la incidencia.</Text>
          ) : (
            <Text>Seleccione una incidencia.</Text>
          )}

          <View style={styles.locationCapture}>
            <Text style={styles.sectionTitle}>Captura de ubicación</Text>
            <Text>La consulta usa el proveedor didáctico; si no está disponible, se conserva la referencia manual.</Text>
            <TextInput
              accessibilityLabel="Consulta de ubicación"
              onChangeText={(value) => {
                setLocationQuery(value);
                setCapturedLocation(null);
                setLocationError(null);
              }}
              placeholder="Consulta opcional para geocodificación"
              value={locationQuery}
            />
            <TextInput
              accessibilityLabel="Ubicación manual"
              onChangeText={(value) => {
                setManualLocationLabel(value);
                setCapturedLocation(null);
                setLocationError(null);
              }}
              placeholder="Edificio, zona o referencia"
              value={manualLocationLabel}
            />
            <Pressable
              accessibilityRole="button"
              disabled={isResolvingLocation}
              onPress={() => void resolveLocation(false)}
              style={styles.locationButton}
              testID="resolve-location"
            >
              <Text>Resolver ubicación</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isResolvingLocation}
              onPress={() => void resolveLocation(true)}
              style={styles.locationButton}
              testID="use-manual-location"
            >
              <Text>Usar ubicación manual</Text>
            </Pressable>
            {isResolvingLocation && <Text>Resolviendo ubicación...</Text>}
            {locationError && <Text accessibilityRole="alert">{locationError}</Text>}
            {capturedLocation && (
              <View accessibilityRole="summary" testID="captured-location">
                <Text>Ubicación seleccionada: {capturedLocation.label}</Text>
                <Text>Origen: {capturedLocation.source === 'manual' ? 'captura manual' : 'proveedor didáctico'}</Text>
                {capturedLocation.latitude !== undefined && capturedLocation.longitude !== undefined && (
                  <Text>Coordenadas: {capturedLocation.latitude}, {capturedLocation.longitude}</Text>
                )}
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 24,
    gap: 16,
  },

  header: {
    gap: 8,
    paddingTop: 24,
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
  },

  content: {
    flex: 1,
    gap: 16,
  },

  listPane: {
    gap: 8,
  },

  detailPane: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#d6dbe3',
    paddingTop: 12,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },

  listItem: {
    borderWidth: 1,
    borderColor: '#d6dbe3',
    borderRadius: 8,
    gap: 4,
    padding: 12,
  },

  selectedItem: {
    borderColor: '#1d4ed8',
    backgroundColor: '#eff6ff',
  },

  itemTitle: {
    fontWeight: '700',
  },

  detailBody: {
    gap: 6,
  },

  locationCapture: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#d6dbe3',
    paddingTop: 12,
  },

  locationButton: {
    borderWidth: 1,
    borderColor: '#1d4ed8',
    borderRadius: 8,
    padding: 10,
  },
});
