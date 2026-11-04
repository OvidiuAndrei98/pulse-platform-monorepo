import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { formatToDatetimeLocal } from '@packages/app-core/events/dateTimeValues';
const { hooks, modules, find } = require('../../pulse-app/scripts/helpers/qaHarness.cjs');

function fixture(present = true, dateOnly = false) {
  const parent = hooks(), content = hooks(); let scope = parent;
  const react = new Proxy({}, { get: (_target, key: string) => scope.react[key] });
  const Popover = Object.assign(function Popover() { return null; }, { Trigger: 'Trigger', Content: 'Content' });
  const ui = { Host: 'Host', Popover, RNHostView: 'RNHostView', DatePicker: 'DatePicker', Text: 'Text', Button: 'Button',
    VStack: 'VStack', HStack: 'HStack', GlassEffectContainer: 'GlassEffectContainer', Menu: 'Menu', Image: 'Image' };
  const changes: Date[] = [], presentations: boolean[] = [];
  const adapter = modules({
    react, expo: { requireOptionalNativeModule: () => present ? {} : null },
    'react-native': { useWindowDimensions: () => ({ width: 402 }) },
    '../ui/theme': { colors: { accent: '#ff0044', text: '#fff' } },
    '../ui/GlassSurface': { supportsLiquidGlass: true },
    '@expo/ui/swift-ui': ui,
    '@expo/ui/swift-ui/modifiers': new Proxy({}, { get: (_target, name: string) => (...args: unknown[]) => ({ name, args }) }),
  }).load(path.resolve(__dirname, '../src/dashboard/EventDatePopover.ios.tsx'));
  const props = { children: { type: 'Field', props: {} }, label: 'Start date', value: new Date(2026, 11, 31, 23, 45), locale: 'en-GB', dateOnly,
    isPresented: false, triggerHeight: 42,
    onIsPresentedChange: (open: boolean) => { presentations.push(open); props.isPresented = open; },
    onValueChange: (value: Date) => changes.push(value),
    labels: { day: 'Day', month: 'Month', year: 'Year', hours: 'Hours', minutes: 'Minutes', now: 'Now', done: 'Done' } };
  const render = () => { scope = parent; return parent.render(() => adapter.EventDatePopover(props)); };
  let definition: any;
  const renderContent = () => {
    definition = find(render(), (n: any) => n.type?.name === 'NativeDateContent');
    scope = content; return content.render(() => definition.type(definition.props));
  };
  const picker = (tree: any) => find(tree, (n: any) => n.type === 'DatePicker');
  const action = (tree: any, text: string) => find(tree, (n: any) => n.type === 'Button' && n.props.children?.props.children === text);
  return { props, render, renderContent, presentations, changes, child: () => definition, adapter, picker, action,
    menu: (tree: any, label: string) => find(tree, (n: any) => n.type === 'Menu' && n.props.modifiers.some((m: any) => m.name === 'accessibilityLabel' && m.args[0] === label)),
    chooseMonth: (tree: any, month: string) => find(tree, (n: any) => n.type === 'Button' && n.props.label === month).props.onPress(),
    chooseYear: (tree: any, year: number) => find(tree, (n: any) => n.type === 'Button' && n.props.label === String(year)).props.onPress() };
}

test('one Apple date/time picker keeps scrolling local and commits only the final value on Done', () => {
  const f = fixture(); f.props.isPresented = true;
  let tree = f.renderContent(); const p = f.picker(tree);
  assert.deepEqual(Array.from(p.props.displayedComponents), ['date', 'hourAndMinute']);
  assert.equal(find(tree, (n: any) => n.type === 'Picker'), undefined, 'No repeated custom wheel rows');
  assert.equal(f.changes.length, 0);
  p.props.onDateChange(new Date(2027, 0, 1, 0, 15));
  p.props.onDateChange(new Date(2028, 1, 29, 23, 59));
  assert.equal(f.changes.length, 0, 'Wheel movement never rerenders/validates EventEditor');
  tree = f.renderContent(); f.action(tree, 'Done').props.onPress();
  assert.equal(f.changes.length, 1);
  assert.equal(formatToDatetimeLocal(f.changes[0]!.toISOString()), '2028-02-29T23:59');
  assert.deepEqual(f.presentations, [false]);
  p.props.onDateChange(new Date(2030, 0, 1));
  f.action(tree, 'Done').props.onPress();
  assert.equal(f.changes.length, 1, 'Coasting and duplicate callbacks after dismissal cannot change the field');
});

test('year selection clamps leap days locally, does not lose time and offers no earlier years', () => {
  const f = fixture(); f.props.value = new Date(2028, 1, 29, 23, 45); f.props.isPresented = true;
  let tree = f.renderContent();
  const menu = f.menu(tree, 'Year');
  assert.ok(menu.props.children.every((item: any) => Number(item.props.label) >= new Date().getFullYear()));
  assert.equal(f.picker(tree).props.range.start.getFullYear(), new Date().getFullYear());
  f.chooseYear(tree, 2029);
  tree = f.renderContent();
  assert.equal(formatToDatetimeLocal(f.picker(tree).props.selection.toISOString()), '2029-02-28T23:45');
  assert.equal(f.changes.length, 0);
  f.action(tree, 'Done').props.onPress();
  assert.equal(formatToDatetimeLocal(f.changes[0]!.toISOString()), '2029-02-28T23:45');
});

test('month menu jumps within the selected year, clamps short months and preserves the clock until Done', () => {
  for (const [year, month, expected] of [
    [2028, 'February', '2028-02-29T23:45'],
    [2029, 'February', '2029-02-28T23:45'],
    [2028, 'April', '2028-04-30T23:45'],
  ] as const) {
    const f = fixture(); f.props.value = new Date(year, 0, 31, 23, 45); f.props.isPresented = true;
    let tree = f.renderContent();
    assert.equal(f.menu(tree, 'Month').props.children.length, 12);
    f.chooseMonth(tree, month);
    tree = f.renderContent();
    assert.equal(formatToDatetimeLocal(f.picker(tree).props.selection.toISOString()), expected);
    assert.equal(f.changes.length, 0, 'Month selection stays local until confirmation');
    f.action(tree, 'Done').props.onPress();
    assert.equal(formatToDatetimeLocal(f.changes[0]!.toISOString()), expected);
  }
});

test('outside dismissal discards the draft while retaining content for the native closing animation', () => {
  const f = fixture(); const closed = f.render();
  assert.equal(find(closed, (n: any) => n.type?.name === 'NativeDateContent'), undefined);
  f.props.isPresented = true; const tree = f.renderContent();
  f.picker(tree).props.onDateChange(new Date(2027, 2, 4, 20, 5));
  const latest = f.render();
  const content = find(latest, (n: any) => n.type?.name === 'NativeDateContent');
  find(latest, (n: any) => n.type?.name === 'Popover').props.onIsPresentedChange(false);
  const closing = f.render();
  assert.equal(find(closing, (n: any) => n.type?.name === 'NativeDateContent'), content);
  assert.equal(f.changes.length, 0);
  f.props.isPresented = true; f.renderContent();
  content.props.onValueChange(new Date());
  assert.equal(f.changes.length, 0, 'A superseded presentation cannot commit into the next one');
});

test('date-only mode preserves the local clock and uses the Apple calendar wheels without duplicate year controls', () => {
  const f = fixture(true, true); f.props.isPresented = true;
  let tree = f.renderContent();
  assert.deepEqual(Array.from(f.picker(tree).props.displayedComponents), ['date']);
  assert.equal(find(tree, (n: any) => n.type === 'Menu'), undefined);
  f.picker(tree).props.onDateChange(new Date(2028, 1, 29, 0, 0));
  tree = f.renderContent(); f.action(tree, 'Done').props.onPress();
  assert.equal(formatToDatetimeLocal(f.changes[0]!.toISOString()), '2028-02-29T23:45');
});

test('Now waits for confirmation, opening alone never changes existing data, and unavailable binaries stay safe', () => {
  const f = fixture(); f.props.isPresented = true;
  const tree = f.renderContent();
  assert.equal(f.changes.length, 0);
  f.action(tree, 'Now').props.onPress();
  assert.equal(f.changes.length, 0);
  f.action(f.renderContent(), 'Done').props.onPress();
  assert.equal(f.changes.length, 1);
  assert.ok(Math.abs(f.changes[0]!.getTime() - Date.now()) < 60_000);
  const old = fixture(false);
  assert.equal(old.adapter.supportsEventDatePopover, false);
  assert.equal(old.render(), old.props.children);
});
