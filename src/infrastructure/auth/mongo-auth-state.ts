import type { Collection } from 'mongodb'
import type {
  AuthenticationCreds,
  SignalDataTypeMap,
  SignalKeyStore,
} from '@whiskeysockets/baileys'
import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys'
import { getCollection } from '../db/mongo.js'
import { logger } from '../../utils/logger.js'

type KeyType = keyof SignalDataTypeMap

interface CredentialsDoc {
  _id: 'credentials'
  data: any
}

interface KeyDoc<T extends KeyType = KeyType> {
  _id: string // `${type}:${id}`
  type: T
  id: string
  value: any
}

export async function useMongoAuthState(prefix = 'baileys') {
  const credCol = await getCollection<CredentialsDoc>(`${prefix}.credentials`)
  const keyCol = await getCollection<KeyDoc>(`${prefix}.keys`)

  // Load or init credentials
  const credDoc = await credCol.findOne({ _id: 'credentials' })
  const creds: AuthenticationCreds = credDoc
    // re-stringify + parse so BufferJSON.reviver runs through the whole tree
    ? JSON.parse(JSON.stringify(credDoc.data), BufferJSON.reviver) as AuthenticationCreds
    : initAuthCreds()

  if (!credDoc) {
    await credCol.insertOne({ _id: 'credentials', data: JSON.parse(JSON.stringify(creds, BufferJSON.replacer)) })
  }

  const saveCreds = async () => {
    await credCol.updateOne(
      { _id: 'credentials' },
      { $set: { data: JSON.parse(JSON.stringify(creds, BufferJSON.replacer)) } },
      { upsert: true }
    )
  }

  const keyDocId = (type: KeyType, id: string) => `${type}:${id}`

  const keys: SignalKeyStore = {
    get: async (type, ids) => {
      const out: any = {}
      const docs = await keyCol.find({ _id: { $in: ids.map(id => keyDocId(type as KeyType, id)) } }).toArray()
      for (const id of ids) {
        const doc = docs.find(d => d.id === id && d.type === type)
        // revive nested Buffers correctly
        out[id] = doc ? JSON.parse(JSON.stringify(doc.value), BufferJSON.reviver) : null
      }
      return out
    },
    set: async (data) => {
      const ops = [] as any[]
      for (const _type in data) {
        const type = _type as KeyType
        const entries = data[type] as any
        for (const id in entries) {
          const value = entries[id]
          const _id = keyDocId(type, id)
          if (value) {
            ops.push({
              updateOne: {
                filter: { _id },
                update: {
                  $set: {
                    _id,
                    type,
                    id,
                    value: JSON.parse(JSON.stringify(value, BufferJSON.replacer)),
                  },
                },
                upsert: true,
              },
            })
          } else {
            ops.push({ deleteOne: { filter: { _id } } })
          }
        }
      }
      if (ops.length) await keyCol.bulkWrite(ops, { ordered: false })
    },
    clear: async () => {
      await keyCol.deleteMany({})
    },
  }

  const clearCreds = async () => {
    await Promise.all([
      credCol.deleteMany({}),
      keyCol.deleteMany({}),
    ])
    logger.warn('Cleared WhatsApp auth credentials and keys from MongoDB')
  }

  return { state: { creds, keys }, saveCreds, clearCreds }
}

// Admin helpers to surgically clear problematic Signal state
export async function adminClearSessionsForJid(jid: string, prefix = 'baileys') {
  const keyCol = await getCollection<KeyDoc>(`${prefix}.keys`)
  // extract numeric/user part and optional device from JID like 12345@s.whatsapp.net or 12345:31@s.whatsapp.net or 12345@lid
  const m = jid.match(/^([^@:]+)(?::(\d+))?@([^:]+)$/)
  if (!m) return { deletedCount: 0 }
  const user = m[1]
  const device = m[2] // may be undefined
  // sessions are stored with id like `${user}.${device}` (PN) or `${user}_1.${device}` (LID)
  const devPart = device ? `\.${device}$` : `\.[0-9]+$`
  const re = new RegExp(`^${user}(?:_1)?${devPart}`)
  const { deletedCount } = await keyCol.deleteMany({ type: 'session', id: { $regex: re } as any })
  logger.warn({ jid, deletedCount }, 'Admin: cleared sessions for JID')
  return { deletedCount }
}

export async function adminClearSenderKeys(groupJid: string, authorJid?: string, prefix = 'baileys') {
  const keyCol = await getCollection<KeyDoc>(`${prefix}.keys`)
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let re: RegExp
  if (authorJid) {
    const m = authorJid.match(/^([^@:]+)(?::(\d+))?@([^:]+)$/)
    if (m) {
      const user = m[1]
      const device = m[2] || '\\d+'
      const isLid = m[3] === 'lid'
      const idPart = isLid ? `${user}_1` : user
      re = new RegExp(`^${esc(groupJid)}::${esc(idPart)}::${device}$`)
    } else {
      re = new RegExp(`^${esc(groupJid)}::`)
    }
  } else {
    re = new RegExp(`^${esc(groupJid)}::`)
  }
  const { deletedCount } = await keyCol.deleteMany({ type: 'sender-key', id: { $regex: re } as any })
  logger.warn({ groupJid, authorJid: authorJid || null, deletedCount }, 'Admin: cleared sender-keys')
  return { deletedCount }
}
