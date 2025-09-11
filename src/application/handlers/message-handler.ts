import makeWASocket, { AnyMessageContent, proto, WASocket } from '@whiskeysockets/baileys'
import type { CommandModule } from '../commands/Command.js'
import { getPrefix as getGlobalPrefix, getOwnerJid } from '../../domain/bot/runtime-config.js'
import { getChatPrefix } from '../../infrastructure/repositories/chat-settings.repo.js'
import { logger } from '../../utils/logger.js'
import * as metrics from '../../domain/bot/metrics.js'
import { hub } from '../../web/hub.js'

export function parseCommand(text: string, prefix: string) {
  if (!text?.startsWith(prefix)) return null
  const without = text.slice(prefix.length).trim()
  const [name, ...args] = without.split(/\s+/)
  return { name: name.toLowerCase(), args, body: without }
}

const cooldowns = new Map<string, number>()
const chatMutex = new Map<string, Promise<void>>()
const groupRL = new Map<string, { times: number[]; mutedUntil?: number; warned?: boolean }>()

async function withChatMutex(chatId: string, fn: () => Promise<void>) {
  const prev = chatMutex.get(chatId) || Promise.resolve()
  let resolveNext: () => void
  const next = new Promise<void>(res => { resolveNext = res as any })
  chatMutex.set(chatId, prev.then(() => next))
  try {
    await prev
    await fn()
  } finally {
    resolveNext!()
    if (chatMutex.get(chatId) === next) chatMutex.delete(chatId)
  }
}

export async function createMessageHandler(sock: WASocket, commands: CommandModule[]) {

  const commandMap = new Map<string, CommandModule>()
  for (const c of commands) {
    commandMap.set(c.name.toLowerCase(), c)
    for (const a of c.aliases || []) commandMap.set(a.toLowerCase(), c)
  }

  async function handleMessage(m: proto.IWebMessageInfo) {
    if (!m || m.key.remoteJid === 'status@broadcast') return
    const from = m.key.remoteJid!
    const sender = m.key.participant || m.key.remoteJid!
    const isGroup = from.endsWith('@g.us')
    const text = m.message?.conversation
      || m.message?.extendedTextMessage?.text
      || m.message?.imageMessage?.caption
      || m.message?.videoMessage?.caption
      || ''
    if (!text) return
    // record receive
    if (text) metrics.recordRecv(from, text.slice(0, 80))
    const chatPrefix = (await getChatPrefix(from)) || getGlobalPrefix()
    const parsed = parseCommand(text, chatPrefix)
    if (!parsed) return

    const cmd = commandMap.get(parsed.name)
    if (!cmd) {
      return
    }

    const reply = async (content: AnyMessageContent) => {
      await sock.sendMessage(from, content, { quoted: m })
      metrics.recordSend(from, typeof (content as any).text === 'string' ? (content as any).text.slice(0, 80) : Object.keys(content).join(','))
      hub.emit('metrics', metrics.snapshot())
    }

    try {
      const ownerJid = getOwnerJid()
      const isOwner = !!ownerJid && (sender.split(':')[0] === ownerJid.split(':')[0])
      // group rate limit
      if (isGroup) {
        const nowTs = Date.now()
        const rl = groupRL.get(from) || { times: [] }
        rl.times = rl.times.filter(t => t >= (nowTs - 30000))
        if (rl.mutedUntil && nowTs < rl.mutedUntil) {
          if (!rl.warned) {
            rl.warned = true
            await reply({ text: 'This group is temporarily rate limited due to high activity. Please wait a bit.' })
          }
          groupRL.set(from, rl)
          return
        }
        rl.times.push(nowTs)
        rl.warned = false
        if (rl.times.length > 15) {
          rl.mutedUntil = nowTs + 60000
          await reply({ text: 'Too many commands in a short time. Temporarily muting command responses.' })
          groupRL.set(from, rl)
          return
        }
        groupRL.set(from, rl)
      }
      // owner-only
      if (cmd.ownerOnly && !isOwner) {
        await reply({ text: 'This command is restricted to the owner.' })
        return
      }
      // cooldowns (per user per chat per command)
      const key = `${cmd.name}:${sender}:${from}`
      const now = Date.now()
      const until = cooldowns.get(key) || 0
      if (until > now && !isOwner) {
        const wait = Math.ceil((until - now) / 1000)
        await reply({ text: `Please wait ${wait}s before using this command again.` })
        return
      }
      if (cmd.cooldownMs && cmd.cooldownMs > 0) {
        cooldowns.set(key, now + cmd.cooldownMs)
      }
      metrics.recordCmd(parsed.name, from)
      const exec = async () => {
        // typing indicators
        let typingTimer: NodeJS.Timeout | undefined
        try {
          await sock.presenceSubscribe(from)
        } catch {}
        try {
          // best-effort typing
          await sock.sendPresenceUpdate('composing', from)
          typingTimer = setInterval(() => sock.sendPresenceUpdate('composing', from).catch(()=>{}), 8000)
        } catch {}
        try {
          await cmd.run({ sock, from, sender, isGroup, isOwner, chatPrefix, args: parsed.args, body: parsed.body, reply, message: m })
        } finally {
          if (typingTimer) clearInterval(typingTimer)
          try { await sock.sendPresenceUpdate('paused', from) } catch {}
        }
      }
      await withChatMutex(from, exec)
      hub.emit('metrics', metrics.snapshot())
    } catch (err) {
      logger.error({ err, cmd: parsed.name }, 'Command error')
      metrics.recordCmdError(parsed.name, from)
      hub.emit('metrics', metrics.snapshot())
      await reply({ text: 'An error occurred while running that command.' })
    }
  }

  sock.ev.on('messages.upsert', async (ev) => {
    for (const m of ev.messages) {
      await handleMessage(m)
    }
  })
}
