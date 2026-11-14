import AsyncStorage from '@react-native-async-storage/async-storage';
import { createUiMemoryStore } from '../uiMemory';

export const uiMemoryStore = createUiMemoryStore(AsyncStorage);
