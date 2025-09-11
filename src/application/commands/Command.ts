import type { AnyMessageContent, WASocket, proto } from '@whiskeysockets/baileys'

export interface CommandContext {
  sock: WASocket
  from: string
  sender: string
  isGroup: boolean
  isOwner: boolean
  chatPrefix: string
  args: string[]
  body: string
  reply: (content: AnyMessageContent) => Promise<void>
  message: proto.IWebMessageInfo
}

export interface CommandModule {
  name: string
  aliases?: string[]
  summary?: string
  usage?: string
  examples?: string[]
  ownerOnly?: boolean
  cooldownMs?: number
  description?: string // deprecated, use summary
  run: (ctx: CommandContext) => Promise<void>
}
