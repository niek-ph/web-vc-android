import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BrowserScreen } from './src/features/browser/BrowserScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <BrowserScreen />
    </SafeAreaProvider>
  );
}
