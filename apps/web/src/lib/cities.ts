export type CityOption = {
  slug: string;
  name: string;
  centroid: { lat: number; lon: number };
};

export const FALLBACK_CITIES: CityOption[] = [
  { slug: "mumbai", name: "Mumbai", centroid: { lat: 19.076, lon: 72.8777 } },
  { slug: "bengaluru", name: "Bengaluru", centroid: { lat: 12.9716, lon: 77.5946 } },
  { slug: "chennai", name: "Chennai", centroid: { lat: 13.0827, lon: 80.2707 } },
  { slug: "pune", name: "Pune", centroid: { lat: 18.5204, lon: 73.8567 } },
  { slug: "kolkata", name: "Kolkata", centroid: { lat: 22.5726, lon: 88.3639 } },
];

export function nearestCity(lat: number, lon: number, cities: CityOption[]): CityOption {
  const list = cities.length > 0 ? cities : FALLBACK_CITIES;
  let best = list[0];
  if (!best) {
    return { slug: "pune", name: "Pune", centroid: { lat: 18.5204, lon: 73.8567 } };
  }
  let bestD = Number.POSITIVE_INFINITY;
  for (const city of list) {
    const d = Math.hypot(lat - city.centroid.lat, lon - city.centroid.lon);
    if (d < bestD) {
      bestD = d;
      best = city;
    }
  }
  return best;
}
