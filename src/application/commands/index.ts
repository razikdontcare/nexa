import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import type { CommandModule } from './Command.js'
import { logger } from '../../utils/logger.js'

const dirname = path.dirname(url.fileURLToPath(import.meta.url))

export async function loadCommands(commandsDir = path.resolve(dirname, '../../commands')) {
  const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'))
  const commands: CommandModule[] = []
  for (const file of files) {
    const full = path.join(commandsDir, file)
    try {
      const mod = await import(url.pathToFileURL(full).href)
      const cmd: CommandModule = mod.default || mod.command
      if (!cmd?.name || typeof cmd.run !== 'function') {
        logger.warn({ file }, 'Skipping invalid command module')
        continue
      }
      commands.push(cmd)
    } catch (err) {
      logger.error({ err, file }, 'Failed to load command')
    }
  }
  return commands
}
