import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import style from '@packages/app-core/events/map/openFreeMapDark.json';
import { clusterEvents, validCoordinate } from '@packages/app-core/maps/geometry';

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
  assert.equal(layer.minzoom,13);
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

test('ground footprints cannot paint over 3D buildings, while labels stay readable', () => {
  const buildings = style.layers.findIndex(layer => layer.id === 'spottr-3d-buildings');
  assert.ok(buildings >= 0);
  for (const [index, layer] of style.layers.entries()) {
    // A 2D fill after the extrusion masks walls with ground-level polygons,
    // making distant building footprints look visible through nearer buildings.
    if (['background', 'fill', 'line', 'raster'].includes(layer.type)) {
      assert.ok(index < buildings, `${layer.id} must be on the ground below the buildings`);
    }
    if (layer.type === 'symbol') assert.ok(index > buildings, `${layer.id} must stay above the buildings`);
  }
});

test('buildings grow and fade continuously with zoom without lifting their bases above the roof', () => {
  const appRequire = createRequire(import.meta.url);
  const mapRequire = createRequire(appRequire.resolve('maplibre-gl/package.json'));
  const { createPropertyExpression, latest, validateStyleMin } = mapRequire('@maplibre/maplibre-gl-style-spec');
  assert.deepEqual(validateStyleMin(style), []);
  const layer = style.layers.find(layer => layer.id === 'spottr-3d-buildings')!;
  const compile = (property: string) => {
    const result = createPropertyExpression(layer.paint![property as keyof typeof layer.paint], property, latest['paint_fill-extrusion'][property]);
    assert.equal(result.result, 'success');
    return (zoom: number, properties: Record<string, number> = { render_height: 60, render_min_height: 20 }) =>
      result.value.evaluate({ zoom }, { type: 3, properties }, {});
  };
  const height = compile('fill-extrusion-height'), base = compile('fill-extrusion-base'), opacity = compile('fill-extrusion-opacity');
  assert.equal(height(13.25), 0);
  assert.equal(opacity(13.25), 0);
  assert.equal(height(14.75), 60);
  assert.equal(base(14.75), 20);
  assert.equal(opacity(18), 0.5);
  let previousHeight = 0;
  for (let step = 1; step <= 150; step++) {
    const zoom = 13.25 + step / 100, value = height(zoom);
    assert.ok(value > previousHeight && value - previousHeight < 0.41, 'fractional zoom changes height continuously');
    assert.ok(base(zoom) <= value);
    assert.ok(Math.abs(base(zoom) / value - 1 / 3) < 1e-9, 'building parts rise together with the roof');
    assert.ok(opacity(zoom) >= 0 && opacity(zoom) <= 0.5);
    previousHeight = value;
  }
  assert.equal(height(18, {}), 3, 'missing building heights keep their existing fallback');
});
