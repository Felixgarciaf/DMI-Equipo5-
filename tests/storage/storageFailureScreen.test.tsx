import { render, waitFor } from '@testing-library/react-native';
import { IncidentExplorerScreen } from '../../src/campusops/ui/IncidentExplorerScreen';

test('storage failure is displayed without inventing incidents or leaving a rejected promise', async () => {
  const application = {
    listIncidents: async () => { throw new Error('synthetic storage unavailable'); },
    getIncidentDetail: async () => null,
  };
  const locationProvider = {
    describeCurrentLocation: async () => 'Referencia manual',
    lookupLocation: async () => null,
    resolveIncidentLocation: async () => ({ source: 'manual' as const, label: 'Referencia manual' }),
  };
  const view = await render(
    <IncidentExplorerScreen
      application={application}
      backendStatus="offline"
      locationProvider={locationProvider}
    />,
  );
  await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
  expect(view.queryByText('Fuga de agua en laboratorio B')).toBeNull();
});
