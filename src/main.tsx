import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Sandbox banner: shown on the test-site branch build. Label can be overridden with VITE_APP_ENV.
const envLabel = (import.meta.env.VITE_APP_ENV as string | undefined)?.trim() || 'test';
const bannerStyle: React.CSSProperties = { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2147483647, background: '#f5b301', color: '#111', font: '700 12px/24px system-ui, sans-serif', textAlign: 'center', letterSpacing: '.08em', pointerEvents: 'none' };

createRoot(document.getElementById('root')!).render(<React.StrictMode>
  <div role="note" aria-label="Test site" style={bannerStyle}>TEST SITE · {envLabel.toUpperCase()} · simulated data, may be reset</div>
  <div style={{ paddingTop: 24 }}><App /></div>
</React.StrictMode>);
