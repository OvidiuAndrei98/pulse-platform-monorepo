import test from 'node:test';
import assert from 'node:assert/strict';
import style from '../../pulse-app/src/features/events/map/openFreeMapDark.json';
import { clusterEvents, validCoordinate } from '../src/map/geometry';

test('the bundled dark map uses the intended source and real building height expressions', () => {
  assert.equal(style.version,8);
  assert.equal(style.sources.openmaptiles.url,'https://tiles.openfreemap.org/planet');
  assert.equal(new URL(style.glyphs).hostname,'tiles.openfreemap.org');
  assert.equal(new URL(style.sprite).hostname,'tiles.openfreemap.org');
  const layer=style.layers.find(layer=>layer.id==='spottr-3d-buildings');
  assert.ok(layer);
  assert.equal(layer.type,'fill-extrusion');
  assert.equal(layer.source,'openmaptiles');
  assert.equal(layer['source-layer'],'building');
  assert.equal(layer.minzoom,14);
  assert.equal(JSON.stringify(layer.paint).includes('render_height'),true);
  for(const credit of ['OpenFreeMap','OpenMapTiles','OpenStreetMap'])assert.ok(style.sources.openmaptiles.attribution.includes(credit));
  assert.equal(style.sources.openmaptiles.attribution.includes('Â'),false);
  assert.equal(style.layers.some(layer=>'layout' in layer&&layer.layout?.['icon-image']==='circle-11'),false);
  assert.equal(style.layers.some(layer=>'paint' in layer&&layer.paint&&'fill-pattern' in layer.paint&&layer.paint['fill-pattern']==='wood-pattern'),false);
});

test('invalid coordinates never produce map markers or clusters', () => {
  const rows=[{id:'ok',latitude:44,longitude:26},{id:'nan',latitude:NaN,longitude:26},{id:'range',latitude:91,longitude:26},{id:'missing'}];
  assert.deepEqual(clusterEvents(rows,18).flatMap(group=>group.events.map(event=>event.id)),['ok']);
  assert.equal(validCoordinate({latitude:44,longitude:Infinity}),false);
});
