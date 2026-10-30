import { safeVersion } from '../../../pulse-app/src/features/diagnostics/report';

export function diagnosticVersions(native: { nativeApplicationVersion: unknown; nativeBuildVersion: unknown },
  config: { version?: unknown; ios?: { buildNumber?: unknown }; android?: { versionCode?: unknown } } | null | undefined,
  platform: string, expoGo = false) {
  const first = (...values: unknown[]) => values.map(safeVersion).find(value => value !== 'unknown') ?? 'unknown';
  return {
    // Expo Go's host binary is not the SPOTTR application binary.
    appVersion: first(!expoGo && native.nativeApplicationVersion, config?.version),
    buildVersion: first(!expoGo && native.nativeBuildVersion, platform === 'ios' ? config?.ios?.buildNumber
      : platform === 'android' && config?.android?.versionCode !== undefined ? String(config.android.versionCode) : undefined),
  };
}
