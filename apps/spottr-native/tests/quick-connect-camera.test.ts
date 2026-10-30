import test from 'node:test';
import assert from 'node:assert/strict';

const { hooks, modules, find, deferred } = require('../../pulse-app/scripts/helpers/qaHarness.cjs');
const own = '11111111-1111-4111-8111-111111111111', friend = '22222222-2222-4222-8222-222222222222';

function fixture() {
  const sheetHooks = hooks(), frameHooks = hooks(), previewHooks = hooks();
  let current = sheetHooks, activeListener: (state: string) => void = () => {};
  const react = new Proxy({}, { get: (_, key) => (...args: any[]) => current.react[key](...args) });
  let permission: any = { status: 'granted', granted: true, canAskAgain: true }, permissionReads = 0, permissionRequests = 0;
  const permissionGate = deferred(), apiGate = deferred(), writes: string[] = [], scans: string[] = [];
  const readPermission = async () => { permissionReads++; return permission; };
  const dependencies = {
    react,
    'react-native': { AppState: { currentState: 'active', addEventListener: (_: string, listener: typeof activeListener) => { activeListener = listener; return { remove() {} }; } },
      View: 'View', ActivityIndicator: 'Spinner', StyleSheet: { create: (value: any) => value, absoluteFill: { position: 'absolute', inset: 0 } },
      Linking: { openSettings: async () => {} }, useWindowDimensions: () => ({ width: 390, height: 844 }) },
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' }, ReduceMotion: { System: 'system' },
      useSharedValue: (value: unknown) => current.react.useRef({ value }).current, useAnimatedStyle: (fn: () => any) => fn(), withTiming: (value: unknown) => value },
    'expo-camera': { CameraView: 'Camera', useCameraPermissions: () => [permission, () => { permissionRequests++; return permissionGate.promise.then((value: any) => { permission = value; return value; }); }, readPermission] },
    '@gorhom/bottom-sheet': { BottomSheetView: 'BottomSheetView' },
    'react-native-qrcode-svg': { default: 'QRCode' }, 'lucide-react-native': { QrCode: 'QrIcon', ScanLine: 'ScanIcon' },
    '../auth/AuthProvider': { useAuth: () => ({ user: { id: own, username: 'QA' }, controller: { getToken: () => 'test-session' } }),
      accountApi: (path: string) => { writes.push(path); return apiGate.promise; } },
    '../usePreferences': { usePreferences: () => ({ copy: (key: string) => key, t: (key: string) => key === 'loading' ? 'Loading events...' : key }) },
    '../data/queries': { queryClient: { invalidateQueries: async () => {} } }, '../data/http': { ApiError: class extends Error {} },
    '../ui/AppSheet': { AppSheet: 'Sheet' }, '../ui/Text': { Text: 'Text' }, '../ui/Logo': { Wordmark: 'Logo' },
    '../ui/common': { Button: 'Button' }, '../ui/theme': { colors: { accent: '#ff0044', muted: '#aaa' } },
    '../ui/CapsuleSwitchTrack': { CapsuleSwitchTrack: 'CapsuleSwitchTrack' }, '../ui/GlassSurface': { GlassSurface: 'GlassSurface' },
    './QuickConnectCamera': { QuickConnectCamera: 'CameraFrame' },
  };
  const loader = modules(dependencies), Sheet = loader.load('../../spottr-native/src/profile/QuickConnectSheet.tsx').QuickConnectSheet;
  const Frame = loader.load('../../spottr-native/src/profile/QuickConnectCamera.tsx').QuickConnectCamera;
  const sheet = () => { current = sheetHooks; return sheetHooks.render(() => Sheet({ onClose() {} })); };
  const frame = (active = true) => { current = frameHooks; return frameHooks.render(() => Frame({ active, stopped: false, onScan: (value: string) => scans.push(value) })); };
  let Preview: any, stopped = false;
  const preview = () => {
    if (!Preview) Preview = frame().type;
    current = previewHooks;
    return previewHooks.render(() => Preview({ stopped, onScan: (value: string) => scans.push(value), onRetry() {} }));
  };
  return { sheet, frame, preview, writes, scans, apiGate, permissionGate,
    mode: (value: string) => find(sheet(), (node: any) => node.type === 'CapsuleSwitchTrack').props.onChange(value),
    appState: (value: string) => activeListener(value), setStopped: (value: boolean) => { stopped = value; },
    setPermission: (value: any) => { permission = value; }, permissionReads: () => permissionReads, permissionRequests: () => permissionRequests,
    disposeSheet: () => sheetHooks.unmount(), disposePreview: () => previewHooks.unmount() };
}

test('Quick Connect keeps one sheet height and accepts scans only in the active scan view', async () => {
  const f = fixture(), height = f.sheet().props.height;
  f.mode('scan');
  const scanning = f.sheet(), scan = find(scanning, (node: any) => node.type === 'CameraFrame').props.onScan;
  assert.equal(scanning.props.height, height);
  f.appState('inactive'); scan('glow://friend/' + friend); assert.equal(f.writes.length, 0);
  f.appState('active'); f.mode('code'); scan('glow://friend/' + friend); assert.equal(f.writes.length, 0);
  f.mode('scan');
  const active = find(f.sheet(), (node: any) => node.type === 'CameraFrame').props.onScan;
  active('glow://friend/' + friend); active('glow://friend/' + friend);
  f.mode('scan'); active('glow://friend/' + friend);
  assert.equal(f.writes.length, 1, 'Repeated frames and pressing the active tab cannot connect twice');
  f.mode('code'); f.apiGate.resolve({}); await new Promise(resolve => setImmediate(resolve));
  assert.equal(find(f.sheet(), (node: any) => node.props?.children === 'qr.connected'), undefined, 'An old result cannot replace the QR view');
  f.disposeSheet(); active('glow://friend/' + friend); assert.equal(f.writes.length, 1);
});

test('an invalid QR stays latched until deliberate retry, then a valid profile connects', async () => {
  const f = fixture(); f.sheet(); f.mode('scan');
  const scan = find(f.sheet(), (node: any) => node.type === 'CameraFrame').props.onScan;
  await scan('not a profile'); await scan('glow://friend/' + friend);
  assert.equal(f.writes.length, 0);
  const retry = find(f.sheet(), (node: any) => node.type === 'Button'); retry.props.onPress();
  scan('glow://friend/' + friend); assert.equal(f.writes.length, 1);
  f.apiGate.resolve({}); await new Promise(resolve => setImmediate(resolve)); f.disposeSheet();
});

test('camera cover uses camera copy and suppresses early, stopped and disposed barcode callbacks', () => {
  const f = fixture();
  let tree = f.preview();
  const camera = find(tree, (node: any) => node.type === 'Camera');
  assert.ok(find(tree, (node: any) => node.props?.children === 'qr.startingCamera'));
  assert.equal(find(tree, (node: any) => node.props?.children === 'Loading events...'), undefined);
  camera.props.onBarcodeScanned({ data: 'early' }); assert.equal(f.scans.length, 0);
  camera.props.onCameraReady(); tree = f.preview();
  assert.equal(find(tree, (node: any) => node.props?.testID === 'quick-connect-camera-loading').props['aria-hidden'], true);
  camera.props.onBarcodeScanned({ data: 'ready' }); assert.deepEqual(f.scans, ['ready']);
  f.setStopped(true); f.preview(); camera.props.onBarcodeScanned({ data: 'already scanned' }); assert.equal(f.scans.length, 1);
  f.setStopped(false); f.preview(); f.disposePreview();
  camera.props.onBarcodeScanned({ data: 'late' }); camera.props.onCameraReady(); assert.equal(f.scans.length, 1);
});

test('failed camera ignores late readiness and the preview is absent while inactive', () => {
  const f = fixture();
  const camera = find(f.preview(), (node: any) => node.type === 'Camera');
  camera.props.onMountError(); camera.props.onCameraReady(); camera.props.onBarcodeScanned({ data: 'failed' });
  assert.equal(f.scans.length, 0);
  assert.ok(find(f.preview(), (node: any) => node.props?.testID === 'quick-connect-camera-error'));
  assert.equal(f.frame(false).props.testID, 'quick-connect-camera-permission');
  f.frame(true); assert.equal(f.permissionReads(), 1, 'Resume refreshes camera permission');
  f.disposePreview();
});

test('selecting scan requests initial permission once and never flashes an extra Scan button', async () => {
  const f = fixture(); f.setPermission(null);
  assert.equal(find(f.frame(), (node: any) => node.type === 'Button'), undefined, 'No button during the initial permission read');
  f.setPermission({ status: 'undetermined', granted: false, canAskAgain: true });
  let tree = f.frame(); f.frame();
  assert.equal(f.permissionRequests(), 1);
  assert.equal(find(tree, (node: any) => node.type === 'Button'), undefined, 'The scan tab initiates permission directly');
  f.permissionGate.resolve({ status: 'denied', granted: false, canAskAgain: true });
  await new Promise(resolve => setImmediate(resolve)); tree = f.frame();
  assert.equal(find(tree, (node: any) => node.type === 'Button').props.title, 'qr.allowCamera');
  assert.equal(f.permissionRequests(), 1, 'A refusal never causes repeated prompts');
});
