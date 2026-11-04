import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadConfig } from './config';
import { registerServiceWorker } from './registerServiceWorker';
import './styles/global.css';

// Thin entry point (excluded from coverage and mutation testing; covered by Playwright).
const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element');
}

loadConfig()
  .then((config) => {
    createRoot(root).render(
      <StrictMode>
        <App config={config} />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    root.textContent = `Couldn't start the app: ${error instanceof Error ? error.message : String(error)}`;
  });

registerServiceWorker();
