import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {isMetroWebPreview} from '../src/config.webPreview';

test('optimized and normal Metro previews use their same-origin API proxy', () => {
  for (const origin of ['http://localhost:8081', 'http://127.0.0.1:8083', 'https://preview.exp.direct']) {
    for (const dev of ['true','false']) {
      assert.equal(isMetroWebPreview([`${origin}/apps/spottr-native/index.ts.bundle?platform=web&dev=${dev}&minify=true`],origin),true);
    }
  }
});
test('static exports, native bundles and other-origin scripts never enable the preview proxy', () => {
  const origin='https://spottr.ro';
  for(const sources of [[],['/_expo/static/js/web/index-hash.js'],['/index.bundle?platform=ios&dev=false'],['https://other.test/index.bundle?platform=web&dev=false'],['/index.bundle?platform=web']]) {
    assert.equal(isMetroWebPreview(sources,origin),false);
  }
});
