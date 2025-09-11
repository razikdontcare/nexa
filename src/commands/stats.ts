import { z } from 'zod'
import type { CommandModule } from '../application/commands/Command.js'
import * as metrics from '../domain/bot/metrics.js'

// Define argument schema (adjust as needed)
const Args = z.object({
  // example: name: z.string().min(1)
})

const command: CommandModule = {
  name: 'stats',
  aliases: [],
  summary: 'Show bot runtime statistics',
  usage: '{prefix}stats',
  examples: ['{prefix}stats'],
  ownerOnly: false,
  cooldownMs: 2000,
  run: async ({ reply }) => {
    const s = metrics.snapshot()
    const mb = (n: number) => (n / (1024 * 1024)).toFixed(1)
    const fmtUptime = (ms: number) => {
      const sec = Math.floor(ms / 1000)
      const h = Math.floor(sec / 3600)
      const m = Math.floor((sec % 3600) / 60)
      const s = sec % 60
      return `${h}h ${m}m ${s}s`
    }
    const lines = [
      `Status: ${s.status}`,
      `Version: ${s.version || '-'}`,
      `Uptime: ${fmtUptime(s.uptimeMs)}`,
      `Me: ${s.me || '-'}`,
      `Messages: recv=${s.counters.recv} sent=${s.counters.sent}`,
      `Commands: ok=${s.counters.cmds} errors=${s.counters.cmdErrors}`,
      `Memory: rss=${mb(s.memory.rss)}MB heap=${mb(s.memory.heapUsed)}/${mb(s.memory.heapTotal)}MB`,
    ]
    await reply({ text: lines.join('\n') })
  },
}

export default command
