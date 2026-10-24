// نقطة البداية على طريق قرية طهرة حميد كما يظهر في OpenStreetMap.
export const LOCATION = { name: 'طهرة حميد', lat: 30.5315245, lon: 31.5624221 };
export const CENTER = { lat: LOCATION.lat, lon: LOCATION.lon };
export const BBOX = { south: 30.51, west: 31.48, north: 30.59, east: 31.62 };
export const CITY_DATA_FILE = 'tahra-hamid.geojson';
export const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

export const ESTIMATED_LEVELS = 4; // ارتفاع تقديري عند غياب البيانات
export const LEVEL_HEIGHT_M = 3; // متوسط ارتفاع الطابق (متر)

export const OSM_ATTRIBUTION = '© مساهمو OpenStreetMap (ODbL)';
