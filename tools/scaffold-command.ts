#!/usr/bin/env ts-node
import fs from 'node:fs'
import path from 'node:path'

const name = (process.argv[2] || '').trim()
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error('Usage: npm run scaffold:command <name>  (lowercase, letters/numbers/dash)')
  process.exit(1)
}
const className = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
const file = path.resolve(process.cwd(), 'src/commands', `${name}.ts`)
if (fs.existsSync(file)) {
  console.error('Command already exists:', file)
  process.exit(1)
}
const tpl = `import { z } from 'zod'
import type { CommandModule } from '../application/commands/Command.js'

// Define argument schema (adjust as needed)
const Args = z.object({
  // example: name: z.string().min(1)
})

const command: CommandModule = {
  name: '${name}',
  aliases: [],
  summary: 'Describe what this command does',
  usage: '/${name} <args>',
  examples: [
    '/${name}',
  ],
  ownerOnly: false,
  cooldownMs: 2000,
  run: async ({ reply, args, isOwner, chatPrefix }) => {
    // Validate args (optional)
    // const parsed = Args.safeParse({ /* map args[] to named fields */ })
    // if (!parsed.success) {
    //   await reply({ text: 'Usage: ' + (command.usage || '') })
    //   return
    // }

    await reply({ text: 'Hello from ${name}!\nPrefix here: ' + chatPrefix })
  },
}

export default command
`
fs.writeFileSync(file, tpl, 'utf-8')
console.log('Created', file)

