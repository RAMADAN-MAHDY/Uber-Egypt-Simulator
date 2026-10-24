import { Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { BBOX, LOCATION, OPENFREEMAP_STYLE } from './config.js';

setWorkerUrl(mapLibreWorkerUrl);

export function createVillageMap(container, markerElement, { onSelect, onReady, onError }) {
  const markerArrow = markerElement.firstElementChild;
  const map = new MapLibreMap({
    container,
    style: OPENFREEMAP_STYLE,
    center: [LOCATION.lon, LOCATION.lat],
    zoom: 16,
    pitch: 48,
    bearing: 0,
    minZoom: 12,
    maxZoom: 19,
    maxBounds: [[BBOX.west, BBOX.south], [BBOX.east, BBOX.north]],
    attributionControl: true,
    cooperativeGestures: true,
  });
  const marker = new Marker({ element: markerElement, anchor: 'center' })
    .setLngLat([LOCATION.lon, LOCATION.lat])
    .addTo(map);

  let lastPosition = [LOCATION.lon, LOCATION.lat, 0];
  map.on('load', () => {
    map.addSource('camera-field-of-view', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addLayer({
      id: 'camera-field-of-view-fill',
      type: 'fill',
      source: 'camera-field-of-view',
      paint: { 'fill-color': '#2472cf', 'fill-opacity': 0.2 },
    });
    map.addLayer({
      id: 'camera-field-of-view-outline',
      type: 'line',
      source: 'camera-field-of-view',
      paint: { 'line-color': '#185aab', 'line-width': 1.5 },
    });
    onReady();
    updateFieldOfView(...lastPosition);
  });
  map.on('error', (event) => {
    if (event.error && !map.isStyleLoaded()) onError(event.error);
  });
  map.on('click', (event) => onSelect([event.lngLat.lng, event.lngLat.lat]));

  function updateFieldOfView(lon, lat, heading) {
    if (!map.getSource('camera-field-of-view')) return;
    const forward = [Math.cos(heading), Math.sin(heading)];
    const side = [-forward[1], forward[0]];
    const point = (distance, sideOffset) => {
      const x = forward[0] * distance + side[0] * sideOffset;
      const z = forward[1] * distance + side[1] * sideOffset;
      return [lon + x / (111320 * Math.cos((lat * Math.PI) / 180)), lat - z / 110574];
    };
    map.getSource('camera-field-of-view').setData({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [lon, lat],
          point(55, 24),
          point(55, -24),
          [lon, lat],
        ]],
      },
    });
  }

  return {
    update(lon, lat, heading, follow = true) {
      lastPosition = [lon, lat, heading];
      marker.setLngLat([lon, lat]);
      markerArrow.style.transform = `rotate(${90 + (heading * 180) / Math.PI}deg)`;
      updateFieldOfView(lon, lat, heading);
      if (follow && map.isStyleLoaded()) map.easeTo({ center: [lon, lat], duration: 220 });
    },
    center(lon, lat) {
      map.easeTo({ center: [lon, lat], duration: 400 });
    },
    resize() {
      map.resize();
    },
    onUserDrag(callback) {
      map.on('dragstart', callback);
    },
  };
}
