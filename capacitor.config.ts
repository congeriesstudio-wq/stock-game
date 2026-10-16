import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.congeriesstudio.stockgame',
  appName: 'Ticker Arena',
  webDir: 'dist',
  android: { allowMixedContent: false },
};

export default config;
