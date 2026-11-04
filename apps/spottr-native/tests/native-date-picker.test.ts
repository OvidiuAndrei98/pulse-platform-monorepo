import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { withPickerDate, withPickerTime, withPickerParts } from '../src/dashboard/datePickerParts';
import { formatToDatetimeLocal } from '@packages/app-core/events/dateTimeValues';
const { hooks, modules, find } = require('../../pulse-app/scripts/helpers/qaHarness.cjs');

function fixture(platform = 'android', present = true) {
  const h = hooks(), opens: any[] = [], dismisses: string[] = [], changes: Date[] = [];
  let imports = 0, disabled = false, fallback = 0;
  const adapter = modules({
    react: h.react,
    'react-native': { Platform: { OS: platform }, UIManager: { hasViewManagerConfig: () => present }, TurboModuleRegistry: { get: () => present ? {} : null } },
    '../ui/theme': { colors: { accent: '#ff0044', muted: '#999999' } },
    '@react-native-community/datetimepicker': { get default() { imports++; return 'NativePicker'; },
      DateTimePickerAndroid: { open: (props: any) => opens.push(props), dismiss: async (mode: string) => { dismisses.push(mode); return true; } } },
  }).load(path.resolve(__dirname, '../src/dashboard/NativeDateTimePicker.native.tsx'));
  let state: any;
  const render = () => { state = h.render(() => adapter.useNativeDateTimePicker(disabled)); };
  render();
  return { opens, dismisses, changes, adapter, render, unmount: () => h.unmount(),
    setDisabled: () => { disabled = true; render(); }, available: () => state.available,
    open: (mode = 'datetime') => state.openAndroid(new Date(2026, 10, 3, 23, 45), mode, (date: Date) => changes.push(date), () => fallback++),
    fallback: () => fallback, imports: () => imports,
  };
}

test('Android commits one complete date+time value; selecting the date alone or cancelling never mutates the form', () => {
  const f = fixture();
  assert.equal(f.open(), true);
  assert.equal(f.opens[0].mode, 'date');
  f.opens[0].onValueChange({}, new Date(2026, 11, 31));
  assert.equal(f.opens[1].mode, 'time');
  assert.equal(f.opens[1].is24Hour, true);
  assert.equal(f.opens[1].value.getHours(), 23);
  assert.equal(f.changes.length, 0);
  f.opens[1].onDismiss();
  assert.equal(f.changes.length, 0);
  f.open(); f.opens[2].onValueChange({}, new Date(2028, 1, 29));
  f.opens[3].onValueChange({}, new Date(2000, 0, 1, 0, 15));
  assert.equal(f.changes.length, 1);
  assert.equal(formatToDatetimeLocal(f.changes[0]!.toISOString()), '2028-02-29T00:15');
  f.opens[3].onValueChange({}, new Date());
  assert.equal(f.changes.length, 1, 'Late or repeated native callbacks cannot commit twice');
  f.unmount();
});

test('native dialogs ignore cancelled, superseded, disabled and unmounted sessions', () => {
  const f = fixture();
  f.open('date'); f.open('time');
  assert.deepEqual(f.dismisses, ['date', 'time']);
  f.opens[0].onValueChange({}, new Date());
  assert.equal(f.changes.length, 0);
  f.setDisabled();
  f.opens[1].onValueChange({}, new Date());
  assert.equal(f.changes.length, 0);
  assert.equal(f.open(), false);
  f.unmount();
  const g = fixture(); g.open(); g.unmount();
  g.opens[0].onValueChange({}, new Date());
  assert.equal(g.opens.length, 1, 'No second dialog after navigating away');
});

test('native errors fall back once and old binaries never load missing native components', () => {
  const f = fixture(); f.open();
  f.opens[0].onError(new Error('native failure')); f.opens[0].onError(new Error('late failure'));
  assert.equal(f.fallback(), 1); assert.equal(f.changes.length, 0); f.unmount();
  for (const os of ['ios', 'android']) {
    const absent = fixture(os, false);
    assert.equal(absent.available(), false); assert.equal(absent.open(), false);
    assert.equal(absent.adapter.NativeDateTimePicker({ value: new Date() }), null);
    assert.equal(absent.imports(), 0); absent.unmount();
  }
});

test('date-only and time-only modes preserve local parts across midnight, leap days and year changes', () => {
  const original = new Date(2026, 11, 31, 23, 58);
  const date = withPickerDate(original, new Date(2028, 1, 29));
  assert.equal(formatToDatetimeLocal(date.toISOString()), '2028-02-29T23:58');
  assert.equal(formatToDatetimeLocal(withPickerTime(date, new Date(2000, 0, 1, 0, 3)).toISOString()), '2028-02-29T00:03');
  const f = fixture(); f.open('date'); f.opens[0].onValueChange({}, new Date(2027, 0, 1));
  assert.equal(f.opens.length, 1); assert.equal(f.changes[0]!.getHours(), 23); f.unmount();
});

test('individual wheels clamp short months and leap years while preserving the local clock', () => {
  const january = new Date(2028, 0, 31, 23, 45);
  const february = withPickerParts(january, { month: 1 });
  assert.equal(formatToDatetimeLocal(february.toISOString()), '2028-02-29T23:45');
  assert.equal(formatToDatetimeLocal(withPickerParts(february, { year: 2029 }).toISOString()), '2029-02-28T23:45');
  assert.equal(formatToDatetimeLocal(withPickerParts(february, { hours: 0, minutes: 3 }).toISOString()), '2028-02-29T00:03');
});

test('iOS uses the system component and the browser adapter imports no native modules', () => {
  const f = fixture('ios'); assert.equal(f.available(), true);
  const handler = () => {};
  const native = f.adapter.NativeDateTimePicker({ value: new Date(), mode: 'datetime', display: 'inline', onValueChange: handler });
  assert.equal(native.type, 'NativePicker'); assert.equal(native.props.onValueChange, handler);
  assert.equal(f.open(), false); assert.equal(f.opens.length, 0); f.unmount();
  const web = modules({}).load(path.resolve(__dirname, '../src/dashboard/NativeDateTimePicker.tsx'));
  assert.equal(web.useNativeDateTimePicker().available, false);
  assert.equal(web.NativeDateTimePicker({ value: new Date() }), null);
});

test('iOS event fields keep separate local date/time parts inside a fixed, non-scrolling glass panel', () => {
  const parent = hooks(), popup = hooks(); let scope = parent;
  const react = { useState: (...args: any[]) => scope.react.useState(...args), useRef: (...args: any[]) => scope.react.useRef(...args),
    useEffect: (...args: any[]) => scope.react.useEffect(...args) };
  const { DateTimeField } = modules({
    react,
    'react-native': { View: 'View', Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView', Platform: { OS: 'ios' },
      Keyboard: { dismiss() {} }, useWindowDimensions: () => ({ width: 402, height: 874 }) },
    'lucide-react-native': new Proxy({}, { get: (_: unknown, key: string) => key }),
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 62, bottom: 34 }) },
    '../usePreferences': { usePreferences: () => ({ language: 'en', copy: (key: string) => key }) },
    '../ui/AccentPressable': { AccentPressable: 'AccentPressable' }, '../ui/GlassSurface': { GlassSurface: 'GlassSurface', supportsLiquidGlass: true },
    '../ui/GlassButtonGroup': { GlassButtonGroup: 'GlassButtonGroup' }, '../ui/FormInput': { FormInput: 'TextInput' }, '../ui/Text': { Text: 'Text' },
    '../ui/theme': { colors: { accent: '#ff0044', text: '#ffffff', muted: '#999999' } },
    './common': { dColors: { text: '#fff' } }, './EditorControls': { e: { text: {}, error: {} } },
    './NativeDateTimePicker': { NativeDateTimePicker: 'NativePicker', useNativeDateTimePicker: () => ({ available: true, openAndroid: () => false }) },
  }).load(path.resolve(__dirname, '../src/dashboard/DateTimeField.tsx'));
  const changes: string[] = [];
  const render = () => { scope = parent; return parent.render(() => DateTimeField({ label: 'Start date', value: '2026-11-03T23:45', onChange: (value: string) => changes.push(value) })); };
  let field = render();
  find(field, (n: any) => n.props?.accessibilityLabel === 'Start date').props.onPress();
  field = render(); assert.equal(changes.length, 0, 'Opening an empty/current picker never commits implicitly');
  const pop = find(field, (n: any) => typeof n.type === 'function' && n.type.name === 'Popover');
  scope = popup; const rendered = popup.render(() => pop.type(pop.props));
  assert.equal(find(rendered, (n: any) => n.type === 'ScrollView'), undefined, 'Only native wheels scroll, never the panel/footer');
  const surface = find(rendered, (n: any) => n.type === 'GlassSurface');
  const frame = Object.assign({}, ...surface.props.style);
  assert.equal(frame.width, 362); assert.equal(frame.height, 380); assert.equal(surface.props.interactive, false);
  const group = find(rendered, (n: any) => n.type === 'GlassButtonGroup');
  assert.equal(group.props.spacing, 8); assert.equal(group.props.style.gap, 8);
  const actions = group.props.children;
  assert.equal(actions[0].props.style.height, 44); assert.equal(actions[1].props.style.height, 44);
  assert.ok(actions[0].props.glassColor, 'Now uses a real native glass material');
  const date = find(rendered, (n: any) => n.props?.testID === 'editor-native-date-picker');
  const time = find(rendered, (n: any) => n.props?.testID === 'editor-native-date-time');
  assert.equal(date.props.mode, 'date'); assert.equal(date.props.display, 'spinner'); assert.equal(date.props.style.width, 362);
  assert.equal(time.props.mode, 'time'); assert.equal(time.props.display, 'compact');
  date.props.onValueChange({}, new Date(2028, 1, 29, 0, 0));
  time.props.onValueChange({}, new Date(2000, 0, 1, 0, 15));
  assert.equal(changes[0], '2028-02-29T23:45'); assert.equal(changes[1], '2026-11-03T00:15');
});
