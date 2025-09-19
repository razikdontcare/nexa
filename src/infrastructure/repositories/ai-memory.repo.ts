import type { Collection } from 'mongodb'
import { getCollection } from '../db/mongo.js'

export type MemoryScope = 'user' | 'chat'

export type AiMemoryDoc = {
  _id: string // composite key
  remoteJid: string
  sender?: string
  scope: MemoryScope
  key: string
  value: string
  createdAt: Date
  updatedAt: Date
}

let colPromise: Promise<Collection<AiMemoryDoc>> | null = null
async function getCol() {
  if (!colPromise) colPromise = getCollection<AiMemoryDoc>('ai_memory')
  return colPromise
}

export async function saveMemory(params: { remoteJid: string; sender?: string; key: string; value: string; scope?: MemoryScope }) {
  const { remoteJid, sender, key } = params
  const scope: MemoryScope = params.scope || 'user'
  const value = String(params.value || '')
  const id = scope === 'user' ? `${remoteJid}:${sender || ''}:${key}` : `${remoteJid}::${key}`
  const col = await getCol()
  const now = new Date()
  await col.updateOne(
    { _id: id },
    {
      $set: { remoteJid, sender, scope, key, value, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  )
}

export async function listMemories(filter: { remoteJid: string; sender?: string }): Promise<Pick<AiMemoryDoc, 'scope' | 'key' | 'value'>[]> {
  const col = await getCol()
  const { remoteJid, sender } = filter
  const query = {
    remoteJid,
    $or: [
      { scope: 'chat' as const },
      { scope: 'user' as const, sender: sender || undefined },
    ],
  }
  const docs = await col.find(query as any).limit(50).toArray()
  return docs.map(d => ({ scope: d.scope, key: d.key, value: d.value }))
}

