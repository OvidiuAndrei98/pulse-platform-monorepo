const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../src');

function hooks() {
  const slots = [];
  let cursor = 0, effects = [], render;
  const memo = (fn, deps) => {
    const index = cursor++, old = slots[index];
    if (!old || !deps || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) slots[index] = { deps, value: fn() };
    return slots[index].value;
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef: initial => memo(() => ({ current: initial }), []),
    useMemo: memo,
    useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect(fn, deps) {
      const index = cursor++, old = slots[index];
      if (!old || !deps || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) {
        slots[index] = { deps, cleanup: old?.cleanup };
        effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
    createContext: value => ({ Provider: 'provider', value }),
    useContext: context => context.value,
    useId: () => 'test-id',
    forwardRef: render => Object.assign(props => render(props,null),{__forwardRef:true}),
    isValidElement: value => !!value && typeof value==='object' && 'type' in value,
    cloneElement: (element,props,children=element.props?.children) => ({...element,props:{...element.props,...props,children}}),
    Children: {toArray: children => [children].flat(Infinity).filter(value=>value!=null&&value!==false),map: (children,fn)=>[children].flat(Infinity).map(fn)},
  };
  return {
    react,
    render(fn = render) { render = fn; cursor = 0; const value = fn(); const pending = effects; effects = []; pending.forEach(fn => fn()); return value; },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

function modules(mocks = {}, globals = {}) {
  const cache = new Map();
  const context = vm.createContext({ console, Date, Error, TypeError, URL, Map, Set, Promise, Event, setTimeout, clearTimeout, ...globals });
  function load(file) {
    file = path.resolve(root, file);
    file = [file, file + '.ts', file + '.tsx'].find(candidate => fs.existsSync(candidate));
    if (!file) throw new Error('Missing test module');
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const require = name => {
      if (name in mocks) return mocks[name];
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
      return load(name.startsWith('@/') ? name.slice(2) : path.resolve(path.dirname(file), name));
    };
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    vm.runInContext('(function(require,exports){' + output + '\n})', context)(require, exports);
    return exports;
  }
  return { load };
}

function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const settle = () => new Promise(resolve => setImmediate(resolve));
function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  if(node.type?.__forwardRef)return find(node.type(node.props),predicate);
  for (const child of [node.props?.children].flat(Infinity)) { const match = find(child, predicate); if (match) return match; }
}
module.exports = { hooks, modules, deferred, settle, find };
