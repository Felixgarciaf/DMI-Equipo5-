import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';

import { getBackendHealth } from './src/api/courseBackend';
import { campusOpsApplication } from './src/campusops/bootstrap';
import { IncidentExplorerScreen } from './src/campusops/ui/IncidentExplorerScreen';

export default function App() {
  const [status, setStatus] = useState<'checking' | 'available' | 'offline'>('checking');

  useEffect(() => {
    let active = true;
    getBackendHealth()
      .then(() => active && setStatus('available'))
      .catch(() => active && setStatus('offline'));
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <IncidentExplorerScreen application={campusOpsApplication} backendStatus={status} />
      <StatusBar style="auto" />
    </>
  );
}
