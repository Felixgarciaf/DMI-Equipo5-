import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import {
  getBackendHealth,
  subscribeToSessionStatus,
} from './src/api/courseBackend';
import { campusOpsApplication } from './src/campusops/bootstrap';
import { IncidentExplorerScreen } from './src/campusops/ui/IncidentExplorerScreen';

export default function App() {
  const [status, setStatus] = useState<'checking' | 'available' | 'offline'>('checking');
  const [loginRequired, setLoginRequired] = useState(false);

  useEffect(() => {
    let active = true;
    getBackendHealth()
      .then(() => active && setStatus('available'))
      .catch(() => active && setStatus('offline'));
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      subscribeToSessionStatus((sessionStatus) => {
        if (sessionStatus === 'anonymous') {
          setLoginRequired(true);
        }
      }),
    [],
  );

  if (loginRequired) {
    return (
      <>
        <View accessibilityRole="summary" testID="login-required">
          <Text>Login requerido</Text>
          <Text>Inicia sesión nuevamente para continuar.</Text>
        </View>
        <StatusBar style="auto" />
      </>
    );
  }

  return (
    <>
      <IncidentExplorerScreen application={campusOpsApplication} backendStatus={status} />
      <StatusBar style="auto" />
    </>
  );
}
