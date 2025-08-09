// src/commands/help.ts
import { ICommand } from "@/types/command";
import { proto } from "baileys";
import { ICommandInfo } from "@/types/command";

const help: ICommand = {
  name: "help",
  aliases: ["h", "?"],
  description: "Display this help message or get info on a specific command",
  usage: "!help [command]",
  category: "General",

  execute: async (
    message: proto.IWebMessageInfo,
    args: string[],
    context
  ): Promise<void> => {
    const { sock, commandHandler } = context;
    const from = message.key.remoteJid!;

    if (args.length > 0) {
      const commandName = args[0].toLowerCase();
      const command = commandHandler.getCommand(commandName);

      if (command) {
        let helpText = `*Command:* ${command.name}\n`;
        helpText += `*Description:* ${command.description}\n`;
        if (command.usage) helpText += `*Usage:* ${command.usage}\n`;
        if (command.aliases && command.aliases.length > 0)
          helpText += `*Aliases:* ${command.aliases.join(", ")}\n`;
        if (command.category) helpText += `*Category:* ${command.category}\n`;
        if (command.cooldown) helpText += `*Cooldown:* ${command.cooldown}s\n`;

        await sock.sendMessage(from, { text: helpText });
      } else {
        await sock.sendMessage(from, {
          text: `❌ Command '${commandName}' not found.`,
        });
      }
    } else {
      const allCommands = commandHandler.getAllCommands();
      let helpText = `*Available Commands:*\n\n`;
      const categorized = commandHandler.getCommandsByCategory();

      for (const [category, cmdNames] of categorized) {
        const cmdsInCategory = cmdNames
          .map((name) => commandHandler.getCommand(name))
          .filter(Boolean) as ICommandInfo[];
        if (cmdsInCategory.length > 0) {
          helpText += `*${category}:*\n`;
          helpText += cmdsInCategory
            .map(
              (c) =>
                `• ${c.name}${c.aliases ? ` (${c.aliases.join(", ")})` : ""}: ${
                  c.description
                }`
            )
            .join("\n");
          helpText += "\n\n";
        }
      }

      helpText += `Use *!help <command>* for more info on a specific command.`;
      await sock.sendMessage(from, { text: helpText });
    }
  },
};

export default help;
