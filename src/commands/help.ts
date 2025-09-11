import type { CommandModule } from '../application/commands/Command.js'
import { loadCommands } from '../application/commands/index.js'

const command: CommandModule = {
  name: 'help',
  aliases: ['menu', 'commands'],
  summary: 'List available commands',
  run: async ({ reply, isOwner, args, chatPrefix }) => {
    const cmds = await loadCommands()
    const render = (s?: string) => (s ? s.replace(/\{prefix\}/g, chatPrefix) : s)
    if (args.length) {
      const name = args[0].toLowerCase()
      const cmd = cmds.find(c => c.name === name || (c.aliases || []).map(a=>a.toLowerCase()).includes(name))
      if (!cmd || (cmd.ownerOnly && !isOwner)) {
        await reply({ text: 'Command not found.' })
        return
      }
      const lines: string[] = []
      lines.push(`• ${cmd.name}${cmd.ownerOnly ? ' [owner]' : ''}`)
      if (cmd.summary) lines.push(`  – ${render(cmd.summary)}`)
      if (cmd.usage) lines.push(`Usage: ${render(cmd.usage)}`)
      if (cmd.examples?.length) {
        lines.push('Examples:')
        for (const ex of cmd.examples) lines.push(`  • ${render(ex)}`)
      }
      await reply({ text: lines.join('\n') })
      return
    }
    const lines = cmds
      .filter(c => !c.ownerOnly || isOwner)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(c => `• ${c.name}${c.aliases?.length ? ` (${c.aliases.join(', ')})` : ''}${(c.summary || c.description) ? ` – ${render(c.summary || c.description)}` : ''}${c.ownerOnly ? ' [owner]' : ''}`)
    await reply({ text: `Commands:\n${lines.join('\n')}` })
  },
}

export default command
