import { requireOptionalNativeModule } from 'expo';
import { AppState } from 'react-native';

// Updated JavaScript may reach an older Xcode binary before its native rebuild.
const network: typeof import('expo-network') | undefined = requireOptionalNativeModule('ExpoNetwork') ? require('expo-network') : undefined;
function connected(state: { isConnected?: boolean; isInternetReachable?: boolean }): boolean | null {
  if (state.isConnected === false || state.isInternetReachable === false) return false;
  return state.isConnected === true ? true : null;
}
export async function getScannerConnection(): Promise<boolean | null> {
  try { return network ? connected(await network.getNetworkStateAsync()) : null; }
  catch { return null; }
}
export function watchScannerConnection(listener: (value: boolean | null) => void) {
  let active = true, revision = 0;
  const refresh = () => {
    const version = ++revision;
    void getScannerConnection().then(value => { if (active && version === revision) listener(value); });
  };
  const subscription = network?.addNetworkStateListener(state => { revision++; if (active) listener(connected(state)); });
  const app = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
  refresh();
  return () => { active = false; revision++; subscription?.remove(); app.remove(); };
}
