import { render, waitFor } from '@testing-library/react-native';
import { IncidentExplorerScreen } from '../../src/campusops/ui/IncidentExplorerScreen';

test('storage failure is displayed without inventing incidents or leaving a rejected promise', async () => {
  const application = {
    listIncidents: async () => { throw new Error('synthetic storage unavailable'); },
    getIncidentDetail: async () => null,
  };
  const view = await render(<IncidentExplorerScreen application={application} backendStatus="offline" />);
  await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
  expect(view.queryByText('Fuga de agua en laboratorio B')).toBeNull();
});
