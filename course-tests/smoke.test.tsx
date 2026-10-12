import { act, render, waitFor } from '@testing-library/react-native';

import App from '../App';

let mockSessionStatusListener:
  | ((status: 'authenticated' | 'anonymous') => void)
  | undefined;

jest.mock('../src/api/courseBackend', () => ({
  getBackendHealth: jest.fn().mockResolvedValue({
    ok: true,
    service: 'dmi-controlled-backend',
    contractVersion: 1,
  }),
  subscribeToSessionStatus: jest.fn(
    (listener: (status: 'authenticated' | 'anonymous') => void) => {
      mockSessionStatusListener = listener;
      return () => {
        mockSessionStatusListener = undefined;
      };
    },
  ),
}));

beforeEach(() => {
  mockSessionStatusListener = undefined;
});

test('renders the reproducible baseline and resolves backend state', async () => {
  const view = await render(<App />);
  expect(view.getByText('CampusOps')).toBeTruthy();
  await waitFor(() => expect(view.getByTestId('backend-status').props.children.join('')).toContain('available'));
});

test('shows the login-required screen after the session becomes anonymous', async () => {
  const view = await render(<App />);
  await waitFor(() => expect(mockSessionStatusListener).toBeDefined());

  await act(async () => {
    mockSessionStatusListener?.('anonymous');
  });

  expect(view.getByTestId('login-required')).toBeTruthy();
  expect(view.getByText('Login requerido')).toBeTruthy();
  console.log('SEMANA 6 / UI: "Login requerido" visible tras cambio a anonymous.');
});
