import { createContext, useContext } from 'react';
import { z } from 'zod';

// In AWS the web-content stack writes /config.json next to index.html (research.md).
const AwsConfigSchema = z.object({
  appEnv: z.literal('aws'),
  apiUrl: z.url(),
  cognitoAuthority: z.url(),
  cognitoClientId: z.string().min(1),
  redirectUri: z.url(),
});

export type AwsConfig = z.infer<typeof AwsConfigSchema>;
export interface LocalConfig {
  appEnv: 'local';
  apiUrl: string;
}
export type AppConfig = LocalConfig | AwsConfig;

interface BuildEnv {
  VITE_APP_ENV?: string;
  VITE_API_URL?: string;
}

export async function loadConfig(
  env: BuildEnv = import.meta.env as BuildEnv,
  fetchFn: typeof fetch = fetch,
): Promise<AppConfig> {
  if (env.VITE_APP_ENV === 'local') {
    if (!env.VITE_API_URL) {
      throw new Error('VITE_API_URL must be set when VITE_APP_ENV is local');
    }
    return { appEnv: 'local', apiUrl: env.VITE_API_URL };
  }

  const response = await fetchFn('/config.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not load /config.json (HTTP ${response.status})`);
  }
  return AwsConfigSchema.parse(await response.json());
}

export const ConfigContext = createContext<AppConfig | null>(null);

export function useConfig(): AppConfig {
  const config = useContext(ConfigContext);
  if (!config) {
    throw new Error('useConfig must be used inside <ConfigContext.Provider>');
  }
  return config;
}
