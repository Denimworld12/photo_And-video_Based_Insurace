import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <App />
);

// Register service worker for PWA support
serviceWorkerRegistration.register({
  onUpdate: (registration) => {
    // A new version is available — the next visit will use the updated app
    console.log('[PWA] Update available. Refresh to get the latest version.');
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  },
  onSuccess: () => {
    console.log('[PWA] Content cached for offline use.');
  },
});
