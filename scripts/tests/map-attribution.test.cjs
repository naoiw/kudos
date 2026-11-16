'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const map = fs.readFileSync('src/components/RouteMapCanvas.tsx', 'utf8');
const css = fs.readFileSync('src/components/RouteMap.css', 'utf8');

test('Leaflet attribution control is disabled, not the OpenStreetMap data credit', () => {
  assert.match(map, /attributionControl:\s*false/);
  assert.match(map, /attribution:\s*\n\s*'&copy; <a href="https:\/\/www\.openstreetmap\.org\/copyright"/);
  assert.match(map, /href=\{OSM_COPYRIGHT_URL\}/);
  assert.match(map, /target="_blank"/);
  assert.match(map, /rel="noopener noreferrer"/);
  assert.match(map, /© OpenStreetMap contributors/);
});

test('OSM credit is adjacent to the map normally and inside the map in fullscreen', () => {
  assert.match(map, /<OpenStreetMapAttribution className="route-map-attribution-fullscreen"\s*\/>/);
  assert.match(map, /<OpenStreetMapAttribution className="route-map-attribution-footer"\s*\/>/);
  assert.match(css, /\.route-map-attribution-fullscreen\s*\{\s*display:\s*none/);
  assert.match(css, /\.route-map:fullscreen \.route-map-attribution-fullscreen\s*\{\s*display:\s*block/);
  assert.match(css, /\.route-map:fullscreen \.route-map-attribution-footer\s*\{\s*display:\s*none/);
  assert.match(css, /\.route-map:fullscreen \.route-map-attribution-fullscreen\s*\{[^}]*position:\s*absolute/);
  assert.doesNotMatch(css, /\.route-map \.leaflet-control-attribution\s*\{/);
});
