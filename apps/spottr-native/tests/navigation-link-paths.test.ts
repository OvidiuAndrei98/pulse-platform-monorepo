import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { nativePath } from '../src/navigation/links';

const nativeRequire = createRequire(require.resolve('@react-navigation/native/package.json'));
const corePath = dirname(nativeRequire.resolve('@react-navigation/core/package.json'));
const { getStateFromPath } = require(resolve(corePath, 'lib/module/getStateFromPath.js'));
// Execute the actual application linking callback with the installed parser.
// Relative route.path values are preserved by React Navigation's web history.
const source = readFileSync(resolve(__dirname, '../src/App.tsx'), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = ast.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [])
  .find(node => node.name.getText(ast) === 'linking');
assert.ok(declaration?.initializer && ts.isObjectLiteralExpression(declaration.initializer));
const callback = declaration.initializer.properties.find(node => ts.isPropertyAssignment(node) && node.name.getText(ast) === 'getStateFromPath');
assert.ok(callback && ts.isPropertyAssignment(callback));
const exports: any = {};
runInNewContext(ts.transpileModule('export const parse = ' + callback.initializer.getText(ast), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, nativePath, getStateFromPath, accountLinkOrigin: (state: unknown) => state });
const config = { initialRouteName: 'Tabs', screens: { Tabs: '', FriendGroup: 'groups/:id',
  GroupInfo: 'groups/:groupId/info', GroupOutings: 'groups/:groupId/outings',
  GroupSharedEvents: 'groups/:groupId/events', GroupEventPicker: 'groups/:groupId/events/select',
  GroupNewOuting: 'groups/:groupId/outings/new', Event: 'events/:id', Search: 'search' } };

test('cold group URLs remain absolute through repeated browser history replacements', () => {
  for (const suffix of ['', '/info', '/outings', '/events', '/events/select', '/outings/new']) {
    const path = '/groups/group-id' + suffix + '?case=local';
    const state = exports.parse(path, config);
    const route = state.routes.at(-1);
    assert.equal(route.path, path);
    let url = 'http://localhost:8083' + path;
    for (let i = 0; i < 5; i++) url = new URL(route.path, url).href;
    assert.equal(url, 'http://localhost:8083' + path, 'State updates cannot duplicate group prefixes');
  }
});

test('normalization retains query values and page presentation for event deep links', () => {
  const state = exports.parse('/events/mobile?eventId=event-id', config);
  const event = state.routes.at(-1);
  assert.equal(event.name, 'Event');
  assert.equal(event.path, '/events/event-id?eventId=event-id');
  assert.equal(event.params.id, 'event-id');
  assert.equal(event.params.presentation, 'page');
});

test('unknown links remain unresolved and Search uses its same canonical destination', () => {
  assert.equal(exports.parse('/not-a-screen', config), undefined);
  assert.equal(exports.parse('/search', config).routes.at(-1).path, '/search');
});
