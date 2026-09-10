import "server-only";

// Server-only wrapper around the pure geo lookup (which is kept script-importable in
// ./geoLookup). App code imports from here so geoip-lite never leaks into a client
// bundle; scripts import ./geoLookup directly.
export {
  lookupGeo,
  countryFromIp,
  lookupGeoDetail,
  type GeoResult,
  type GeoDetail,
} from "./geoLookup";
