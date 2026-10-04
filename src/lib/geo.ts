// ============================================================================
// src/lib/geo.ts
//
// Small geography helpers shared by the map pages (NFL Road Trips, Your Local
// Clubs). No mapping library: the base maps are pre-drawn SVGs in
// public/maps/, and each page places points with the same projection that
// drew its map.
// ============================================================================

export type LatLon = { lat: number; lon: number };

/** Great-circle distance in miles. */
export function milesBetween(a: LatLon, b: LatLon): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin((r(b.lat) - r(a.lat)) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin((r(b.lon) - r(a.lon)) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** A Mercator projection fixed by d3-geo's scale and translate (as fitted
 * offline when the base map was drawn): returns SVG x/y for a point. */
export function mercator(scale: number, tx: number, ty: number) {
  return (p: LatLon): { x: number; y: number } => {
    const lam = (p.lon * Math.PI) / 180;
    const phi = (p.lat * Math.PI) / 180;
    return { x: scale * lam + tx, y: ty - scale * Math.log(Math.tan(Math.PI / 4 + phi / 2)) };
  };
}
