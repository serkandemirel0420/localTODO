import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import React from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import App from './App';

function Root() {
  return (
    <KeyboardProvider
      navigationBarTranslucent
      preload={false}
      preserveEdgeToEdge
      statusBarTranslucent
    >
      <App />
    </KeyboardProvider>
  );
}

registerRootComponent(Root);
