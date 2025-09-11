import type { Collection } from 'mongodb'
import { getCollection } from '../db/mongo.js'
import type { BotConfig } from '../../domain/bot/config.js'
import { config } from '../../config/index.js'

let colPromise: Promise<Collection<BotConfig>> | null = null

async function getCol() {
  if (!colPromise) colPromise = getCollection<BotConfig>('bot_config')
  return colPromise
}

export async function getOrCreateBotConfig(): Promise<BotConfig> {
  const col = await getCol()
  let doc = await col.findOne({ _id: 'default' })
  const now = new Date()
  if (!doc) {
    doc = {
      _id: 'default',
      prefix: config.botPrefix,
      ownerJid: config.botOwnerJid || undefined,
      createdAt: now,
      updatedAt: now,
    }
    await col.insertOne(doc)
  }
  return doc
}

export async function updateBotConfig(patch: Partial<Pick<BotConfig, 'prefix' | 'ownerJid'>>): Promise<BotConfig> {
  const col = await getCol()
  const now = new Date()
  // normalize owner JID if provided (allow plain digits input)
  const norm = (v?: string | null) => {
    if (!v) return v as any
    const s = String(v).trim()
    if (!s) return undefined as any
    if (s.includes('@')) return s
    const digits = s.replace(/[^0-9]/g, '')
    return digits ? `${digits}@s.whatsapp.net` : undefined
  }
  const ownerJid = typeof patch.ownerJid === 'string' ? norm(patch.ownerJid) : patch.ownerJid
  await col.updateOne(
    { _id: 'default' },
    { $set: { ...patch, ...(typeof ownerJid === 'string' ? { ownerJid } : {}), updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  )
  const doc = await col.findOne({ _id: 'default' })
  if (!doc) throw new Error('Failed to load bot config after update')
  return doc
}
