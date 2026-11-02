const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const packages = ['api-client', 'app-core', 'browser-core'];
const manifests = new Map(packages.map(name => ['@packages/' + name, JSON.parse(fs.readFileSync(path.join(root, 'packages', name, 'package.json'), 'utf8'))]));
const forbiddenGlobals = new Set(['globalThis', 'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'importScripts', 'postMessage', 'self', 'process', 'Buffer', '__dirname', '__filename']);
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(path.join(directory, entry.name))
    : /\.[cm]?[jt]sx?$/.test(entry.name) ? [path.join(directory, entry.name)] : []);
}
function checkSource(file, source) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  const core = relative.startsWith('packages/app-core/src/');
  const app = relative.match(/^apps\/([^/]+)\/src\//)?.[1];
  const errors = [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const fail = (node, message) => errors.push(relative + ':' + (tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1) + ': ' + message);
  function module(node, specifier, typeOnly) {
    let resolved;
    if (specifier.startsWith('.')) resolved = path.resolve(path.dirname(file), specifier);
    else if (specifier.startsWith('@/')) resolved = path.join(root, 'apps', app || 'pulse-app', 'src', specifier.slice(2));
    if (resolved) {
      const target = path.relative(root, resolved).replaceAll('\\', '/');
      if (app && target.startsWith('apps/') && !target.startsWith('apps/' + app + '/')) fail(node, 'Cross-app source import: ' + specifier);
      if (!app && !target.startsWith(relative.split('/src/')[0] + '/')) fail(node, 'Package escapes its source boundary: ' + specifier);
    }
    for (const [name, manifest] of manifests) if (specifier === name || specifier.startsWith(name + '/')) {
      const subpath = specifier === name ? '.' : './' + specifier.slice(name.length + 1);
      if (!(subpath in manifest.exports)) fail(node, 'Use a declared public export: ' + specifier);
    }
    if (core && !specifier.startsWith('.') && !(typeOnly && ['@packages/api-client/schema','@packages/api-client/schema-types'].includes(specifier))) fail(node, 'app-core may only import local rules and API contract types: ' + specifier);
    if(relative.startsWith('packages/browser-core/src/')&&/^(react|react-dom|react-native|next)(\/|$)/.test(specifier))fail(node,'browser-core is a DOM adapter, not a React/framework package: '+specifier);
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) module(node, node.moduleSpecifier.text, !!node.isTypeOnly || !!node.importClause?.isTypeOnly);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) module(node, node.argument.literal.text, true);
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require') && ts.isStringLiteral(node.arguments[0])) module(node, node.arguments[0].text, false);
    if (core && ts.isIdentifier(node) && forbiddenGlobals.has(node.text) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) fail(node, 'Platform I/O or Node global in app-core: ' + node.text);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return errors;
}
function check() {
  const directories = ['apps/pulse-app/src', 'apps/spottr-native/src', 'packages/app-core/src', 'packages/browser-core/src'];
  const sources = directories.flatMap(directory => files(path.join(root, directory)));
  const errors = sources.flatMap(file => checkSource(file, fs.readFileSync(file, 'utf8')));
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Architecture OK: ' + sources.length + ' source files; no cross-app imports or private package paths.');
  return errors;
}
if (require.main === module) check();
module.exports = { checkSource, check };
