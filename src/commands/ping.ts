import type { CommandModule } from '../application/commands/Command.js'

const command: CommandModule = {
  name: 'ping',
  summary: 'Simple liveness check',
  cooldownMs: 3000,
  run: async ({ reply }) => {
    const start = Date.now()
    await reply({ text: 'Pong!' })
    const elapsed = Date.now() - start
    await reply({ text: `Latency: ${elapsed}ms` })
  },
}

export default command
