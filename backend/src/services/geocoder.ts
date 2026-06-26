import { getDb } from '../db';
import { configs } from '../db/schema';

export async function geocodeLocation(lat: number, lng: number): Promise<string> {
  const db = getDb();
  const rows = await db.select().from(configs);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  const apiKey = map.geocode_api_key || '';
  if (!apiKey) return '';

  try {
    const res = await fetch(
      `https://restapi.amap.com/v3/geocode/regeo?output=json&location=${lng},${lat}&key=${apiKey}&radius=100&extensions=base`,
    );
    const data = await res.json() as any;
    if (data.status === '1' && data.regeocode?.formatted_address) {
      return data.regeocode.formatted_address as string;
    }
  } catch {}

  return '';
}
