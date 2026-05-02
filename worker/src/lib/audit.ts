import { uuid } from "./crypto.js";

export async function audit(
  db: D1Database,
  eventType: string,
  subscriberId: string | null,
  payload: Record<string, unknown> | null,
  now: number,
): Promise<void> {
  const id = uuid();
  const payloadJson = payload ? JSON.stringify(payload) : null;
  await db
    .prepare(
      `INSERT INTO events_audit (id, subscriber_id, event_type, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, subscriberId, eventType, payloadJson, now)
    .run();
}
