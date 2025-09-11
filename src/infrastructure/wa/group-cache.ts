import type makeWASocket from "@whiskeysockets/baileys";
import type { GroupMetadata } from "@whiskeysockets/baileys";

// Simple in-memory cache with TTL for group metadata
type Cached<T> = { value: T; expiresAt: number };

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes

const cache = new Map<string, Cached<GroupMetadata>>();
let ttlMs = DEFAULT_TTL_MS;

export function configureGroupCache(options?: { ttlMs?: number }) {
  if (options?.ttlMs && options.ttlMs > 0) ttlMs = options.ttlMs;
}

export async function cachedGroupMetadataLookup(jid: string) {
  const c = cache.get(jid);
  if (!c) return undefined;
  if (Date.now() > c.expiresAt) {
    cache.delete(jid);
    return undefined;
  }
  return c.value;
}

export function cacheGroupMetadata(jid: string, meta: GroupMetadata) {
  cache.set(jid, { value: meta, expiresAt: Date.now() + ttlMs });
}

function updateFromPartial(jid: string, partial: Partial<GroupMetadata>) {
  const current = cache.get(jid)?.value;
  if (current) {
    const updated: GroupMetadata = { ...current, ...partial } as GroupMetadata;
    cacheGroupMetadata(jid, updated);
  }
}

export function attachGroupCacheEvents(sock: ReturnType<typeof makeWASocket>) {
  // When groups are added/seen, cache full metadata
  sock.ev.on("groups.upsert", (groups) => {
    try {
      for (const g of groups) cacheGroupMetadata(g.id, g);
    } catch {}
  });

  // When group fields change, merge updates
  sock.ev.on("groups.update", (updates) => {
    try {
      for (const u of updates) {
        // 'id' is required for updates; ensure merge into cache
        // @ts-ignore - type narrowing for safety
        const gid: string | undefined = u?.id;
        if (!gid) continue;
        updateFromPartial(gid, u as Partial<GroupMetadata>);
      }
    } catch {}
  });

  // Keep participant list in sync to avoid network fetches on sendMessage
  sock.ev.on("group-participants.update", ({ id, participants, action }) => {
    try {
      const current = cache.get(id)?.value;
      if (!current) return;
      const setParticipants = new Set(current.participants.map((p) => p.id));

      if (action === "add" || action === "promote" || action === "demote") {
        // For add/promote/demote, ensure participant IDs exist; role changes don't affect encryption target set
        for (const p of participants) setParticipants.add(p);
      } else if (action === "remove") {
        for (const p of participants) setParticipants.delete(p);
      }

      // If we modified size, rebuild participants array mapping roles best-effort
      if (setParticipants.size !== current.participants.length) {
        const byId = new Map(current.participants.map((p) => [p.id, p] as const));
        const next = Array.from(setParticipants).map((id) =>
          byId.get(id) || ({ id, admin: undefined } as any)
        );
        updateFromPartial(id, { participants: next } as any);
      }
    } catch {}
  });
}
