// ============================================================================
// src/lib/geo.ts
//
// Small geography helpers (NFL Road Trips, Your Local Clubs).
// ============================================================================

export type LatLon = { lat: number; lon: number };

/** Great-circle distance in miles. */
export function milesBetween(a: LatLon, b: LatLon): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin((r(b.lat) - r(a.lat)) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin((r(b.lon) - r(a.lon)) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}
