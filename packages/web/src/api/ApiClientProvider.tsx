import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAccessToken } from '../auth/AuthProvider';
import { useConfig } from '../config';
import { createApiClient, type ApiClient } from './client';

const ApiClientContext = createContext<ApiClient | null>(null);

export function ApiClientProvider({ children }: { children: ReactNode }) {
  const { apiUrl } = useConfig();
  const getAccessToken = useAccessToken();
  const client = useMemo(
    () => createApiClient({ apiUrl, getAccessToken }),
    [apiUrl, getAccessToken],
  );

  return <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>;
}

export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (!client) {
    throw new Error('useApiClient must be used inside <ApiClientProvider>');
  }
  return client;
}
