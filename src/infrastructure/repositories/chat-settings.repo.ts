import type { Collection } from 'mongodb'
import { getCollection } from '../db/mongo.js'

type ChatSettingsDoc = {
  _id: string // remoteJid
  prefix?: string
  updatedAt: Date
}

let colPromise: Promise<Collection<ChatSettingsDoc>> | null = null
async function getCol() {
  if (!colPromise) colPromise = getCollection<ChatSettingsDoc>('chat_settings')
  return colPromise
}

// simple in-memory cache with TTL
const cache = new Map<string, { value: string | undefined; expires: number }>()
const TTL_MS = 10 * 60 * 1000

export async function getChatPrefix(remoteJid: string): Promise<string | undefined> {
  const hit = cache.get(remoteJid)
  const now = Date.now()
  if (hit && hit.expires > now) return hit.value
  const col = await getCol()
  const doc = await col.findOne({ _id: remoteJid })
  const prefix = doc?.prefix
  cache.set(remoteJid, { value: prefix, expires: now + TTL_MS })
  return prefix
}

export async function setChatPrefix(remoteJid: string, prefix?: string): Promise<void> {
  const col = await getCol()
  const now = new Date()
  if (prefix && prefix.trim()) {
    await col.updateOne({ _id: remoteJid }, { $set: { prefix: prefix.trim(), updatedAt: now } }, { upsert: true })
  } else {
    await col.updateOne({ _id: remoteJid }, { $unset: { prefix: "" }, $set: { updatedAt: now } }, { upsert: true })
  }
  cache.set(remoteJid, { value: prefix, expires: Date.now() + TTL_MS })
}

export function clearChatPrefixCache(remoteJid?: string) {
  if (remoteJid) cache.delete(remoteJid)
  else cache.clear()
}

