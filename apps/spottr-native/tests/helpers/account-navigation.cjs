const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createRequire } = require('node:module');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');
const nativeRequire = createRequire(require.resolve('@react-navigation/native/package.json'));
const coreRequire = createRequire(nativeRequire.resolve('@react-navigation/core/package.json'));
const { CommonActions, StackActions } = coreRequire('@react-navigation/routers');

/** Exercise the real account adapter against navigation actions, not a hand-written replacement. */
function loadAccountNavigation(os = 'ios') {
  const exports = {};
  const source = readFileSync(resolve(__dirname, '../../src/navigation/accountNavigation.ts'), 'utf8');
  const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(js, {exports, require(name) {
    if(name==='react-native')return {Platform:{OS:os}};
    if(name==='@react-navigation/native')return {CommonActions,StackActions};
    throw Error('Unexpected account navigation dependency: '+name);
  }});
  return exports;
}
module.exports = { loadAccountNavigation };
