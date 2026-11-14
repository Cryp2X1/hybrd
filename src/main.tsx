import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/anton/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles.css';
import { App } from './App';
import { AuthProvider } from './lib/auth';
import { StoreProvider } from './lib/store';
import { RecorderProvider } from './lib/recorder';
import { ToastProvider } from './lib/toast';
import { captureSpotifyCallback } from './lib/spotify';
import { captureStravaCallback } from './lib/strava';

// Supabase auth emails land on the app root (?next=...). Route there after the session is picked up.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');
// Spotify's PKCE callback also lands on the app root (?code=&state=). Take it before Supabase looks at ?code=.
captureSpotifyCallback();
captureStravaCallback();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <StoreProvider>
          <RecorderProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </RecorderProvider>
        </StoreProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}
