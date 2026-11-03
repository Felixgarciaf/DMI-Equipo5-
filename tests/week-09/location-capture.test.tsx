import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { GeocodingLocationAdapter } from '../../src/campusops/infrastructure/geocoding-adapter';
import type { IncidentLocation } from '../../src/campusops/contracts';
import type { LocationLookupRequest, LocationProviderPort } from '../../src/campusops/domain/ports';
import { IncidentExplorerScreen } from '../../src/campusops/ui/IncidentExplorerScreen';

const incident = {
  id: 'campus-inc-001',
  title: 'Fuga de agua',
  category: 'water' as const,
  status: 'assigned' as const,
  priority: 'high' as const,
  locationLabel: 'Edificio B',
  description: 'Incidencia sintética',
  reporterRole: 'reporter' as const,
  assignedRole: 'technician' as const,
  location: { source: 'manual' as const, label: 'Edificio B' },
  version: 1,
};

function application() {
  return {
    listIncidents: async () => [{
      id: incident.id,
      title: incident.title,
      category: incident.category,
      status: incident.status,
      priority: incident.priority,
      locationLabel: incident.locationLabel,
    }],
    getIncidentDetail: async () => incident,
  };
}

function locationProvider(
  resolveIncidentLocation: LocationProviderPort['resolveIncidentLocation'],
): LocationProviderPort {
  return {
    describeCurrentLocation: async () => 'Edificio B',
    lookupLocation: async () => null,
    resolveIncidentLocation,
  };
}

test('captura la ubicación manual desde la interfaz y la muestra en el detalle seleccionado', async () => {
  const resolve = jest.fn<Promise<IncidentLocation>, [LocationLookupRequest]>()
    .mockResolvedValue({ source: 'manual', label: 'Aula C-12, segundo piso' });
  const view = await render(
    <IncidentExplorerScreen
      application={application()}
      backendStatus="offline"
      locationProvider={locationProvider(resolve)}
    />,
  );

  await view.findByText('Captura de ubicación');
  await fireEvent.changeText(view.getByLabelText('Ubicación manual'), ' Aula C-12, segundo piso ');
  await fireEvent.press(view.getByTestId('use-manual-location'));

  await waitFor(() => {
    expect(view.getByTestId('captured-location')).toHaveTextContent(/Ubicación seleccionada: Aula C-12, segundo piso/);
  });
  expect(resolve).toHaveBeenCalledWith({ query: '', manualLabel: 'Aula C-12, segundo piso' });
  expect(view.getByText('Ubicación: Aula C-12, segundo piso')).toBeTruthy();
  expect(view.queryByText(/Coordenadas:/)).toBeNull();
});

test('usa el resultado del proveedor desde la interfaz cuando las coordenadas son válidas', async () => {
  const resolve = jest.fn<Promise<IncidentLocation>, [LocationLookupRequest]>().mockResolvedValue({
    source: 'provider' as const,
    label: 'Zona geocodificada',
    latitude: 19.4,
    longitude: -99.1,
  });
  const view = await render(
    <IncidentExplorerScreen
      application={application()}
      backendStatus="available"
      locationProvider={locationProvider(resolve)}
    />,
  );

  await view.findByText('Captura de ubicación');
  await fireEvent.changeText(view.getByLabelText('Consulta de ubicación'), 'Biblioteca');
  await fireEvent.changeText(view.getByLabelText('Ubicación manual'), 'Biblioteca manual');
  await fireEvent.press(view.getByTestId('resolve-location'));

  await waitFor(() => {
    expect(view.getByTestId('captured-location')).toHaveTextContent(/Coordenadas: 19\.4, -99\.1/);
  });
  expect(resolve).toHaveBeenCalledWith({ query: 'Biblioteca', manualLabel: 'Biblioteca manual' });
});

test('mantiene la referencia manual en la interfaz cuando falla la solicitud al proveedor', async () => {
  const fetchImpl = jest.fn(async () => new Response('{}', { status: 503 }));
  const view = await render(
    <IncidentExplorerScreen
      application={application()}
      backendStatus="offline"
      locationProvider={new GeocodingLocationAdapter({ fetchImpl })}
    />,
  );

  await view.findByText('Captura de ubicación');
  await fireEvent.changeText(view.getByLabelText('Consulta de ubicación'), 'Laboratorio B');
  await fireEvent.changeText(view.getByLabelText('Ubicación manual'), 'Edificio B, planta baja');
  await fireEvent.press(view.getByTestId('resolve-location'));

  await waitFor(() => {
    expect(view.getByTestId('captured-location')).toHaveTextContent(/Ubicación seleccionada: Edificio B, planta baja/);
    expect(view.getByTestId('captured-location')).toHaveTextContent(/Origen: captura manual/);
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(view.queryByText(/Coordenadas:/)).toBeNull();
});

test('rechaza la etiqueta manual vacía y muestra los errores inesperados del proveedor', async () => {
  const resolve = jest.fn<Promise<IncidentLocation>, [LocationLookupRequest]>()
    .mockRejectedValueOnce(new Error('synthetic provider failure'));
  const view = await render(
    <IncidentExplorerScreen
      application={application()}
      backendStatus="offline"
      locationProvider={locationProvider(resolve)}
    />,
  );

  await view.findByText('Captura de ubicación');
  await fireEvent.press(view.getByTestId('use-manual-location'));
  expect(view.getByRole('alert')).toHaveTextContent(/Escribe una referencia manual válida/);
  expect(resolve).not.toHaveBeenCalled();

  await fireEvent.changeText(view.getByLabelText('Ubicación manual'), 'Entrada principal');
  await fireEvent.press(view.getByTestId('resolve-location'));
  await waitFor(() => {
    expect(view.getByRole('alert')).toHaveTextContent(/No fue posible resolver la ubicación/);
  });
});
