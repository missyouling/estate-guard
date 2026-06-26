import { getDb } from '../db';
import { media } from '../db/schema';
import { sql } from 'drizzle-orm';

export async function getNextRecordNo(): Promise<number> {
  const db = getDb();
  const result = await db.select({ max: sql<number>`COALESCE(MAX(${media.record_no}), 0)` }).from(media);
  return (result[0]?.max || 0) + 1;
}
