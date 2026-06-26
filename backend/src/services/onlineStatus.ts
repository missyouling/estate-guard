import { getDb } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const activeUsers = new Map<number, number>();

export function updateActivity(userId: number) {
  activeUsers.set(userId, Date.now());
  try {
    const db = getDb();
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    db.update(users).set({ last_active_at: now }).where(eq(users.id, userId)).run();
  } catch {}
}

export function getOnlineStatus(userIds: number[]): Record<number, boolean> {
  const now = Date.now();
  const result: Record<number, boolean> = {};
  for (const id of userIds) {
    const lastActive = activeUsers.get(id);
    result[id] = !!lastActive && (now - lastActive) < 120000;
  }
  return result;
}
