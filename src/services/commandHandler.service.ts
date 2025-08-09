import { WASocket, proto, jidNormalizedUser } from "baileys";
import fs from "fs";
import path from "path";
import { ICommand, ICommandContext, ICommandInfo } from "@/types/command";
import { logger } from "@/utils/logger";
import { configService } from "./config.service";

export class CommandHandler {
  private commands: Map<string, ICommandInfo> = new Map();
  private aliases: Map<string, string> = new Map();
  private categories: Map<string, string[]> = new Map();

  constructor() {
    if (!configService.isInitialized()) {
      logger.warn("ConfigService is not initialized in CommandHandler.");
    }
    this.loadCommands();
  }

  private async loadCommands(): Promise<void> {
    const commandsDir = path.join(__dirname, "..", "commands");
    logger.info(`Loading commands from directory: ${commandsDir}`);

    if (!fs.existsSync(commandsDir)) {
      logger.warn(`Commands directory does not exist: ${commandsDir}`);
      return;
    }

    const commandFiles = fs
      .readdirSync(commandsDir)
      .filter((file) => file.endsWith(".ts") || file.endsWith(".js"))
      .filter((file) => !file.startsWith("_") && !file.startsWith("."));

    for (const file of commandFiles) {
      try {
        const filePath = path.join(commandsDir, file);
        const commandModule = await import(filePath);
        const command: ICommand = commandModule.default || commandModule;

        if (!command.name || !command.execute) {
          logger.warn(
            `Command in file ${file} is missing required properties.`
          );
          continue;
        }

        const commandInfo: ICommandInfo = {
          ...command,
          filePath,
          lastExecuted: new Map(),
        };

        this.commands.set(command.name.toLocaleLowerCase(), commandInfo);
        logger.info(`Loaded command: ${command.name}`);

        if (command.aliases && Array.isArray(command.aliases)) {
          for (const alias of command.aliases) {
            const lowerAlias = alias.toLocaleLowerCase();
            if (this.aliases.has(lowerAlias)) {
              logger.warn(
                `Alias ${lowerAlias} already exists for command ${this.aliases.get(
                  lowerAlias
                )}`
              );
            } else {
              this.aliases.set(lowerAlias, command.name.toLocaleLowerCase());
              logger.debug(
                `Registered alias: ${lowerAlias} for command: ${command.name}`
              );
            }
          }
        }

        const category = command.category || "General";
        if (!this.categories.has(category)) {
          this.categories.set(category, []);
        }
        this.categories.get(category)!.push(command.name.toLocaleLowerCase());
      } catch (error) {
        logger.error(`Failed to load command from file ${file}:`, error);
      }
    }

    logger.info(
      `Loaded ${this.commands.size} commands with ${this.aliases.size} aliases.`
    );
  }

  async reloadCommands(): Promise<void> {
    logger.info("Reloading commands...");
    this.commands.clear();
    this.aliases.clear();
    this.categories.clear();
    await this.loadCommands();
  }

  getCommand(name: string): ICommandInfo | null {
    const lowerName = name.toLowerCase();
    const actualName = this.aliases.get(lowerName) || lowerName;
    return this.commands.get(actualName) || null;
  }

  getAllCommands(): ICommandInfo[] {
    return Array.from(this.commands.values());
  }

  getCommandsByCategory(): Map<string, string[]> {
    return new Map(this.categories);
  }

  async processCommand(
    sock: WASocket,
    message: proto.IWebMessageInfo,
    sessionId: string
  ): Promise<void> {
    if (!message.message || message.key.fromMe) return;

    const content = this.getMessageContent(message);
    if (!content) return;

    const from = message.key.remoteJid;
    if (!from) return;

    const sender = message.key.participant || message.key.remoteJid;
    if (!sender) return;

    const isGroup = from.endsWith("@g.us");
    const prefix = configService.get("commandPrefix", "!");

    if (!content.startsWith(prefix)) return;

    const args = content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();
    if (!commandName) return;

    const command = this.getCommand(commandName);
    if (!command || command.disabled) {
      return;
    }

    const senderJid = jidNormalizedUser(sender);
    const ownerJid = configService.get("ownerJid", "");
    const isOwner = senderJid === ownerJid;

    if (command.ownerOnly && !isOwner) {
      await sock.sendMessage(from, {
        text: "❌ This command is only for the bot owner.",
      });
      return;
    }

    if (command.groupOnly && !isGroup) {
      await sock.sendMessage(from, {
        text: "❌ This command can only be used in groups.",
      });
      return;
    }

    if (command.privateOnly && isGroup) {
      await sock.sendMessage(from, {
        text: "❌ This command can only be used in private chats.",
      });
      return;
    }

    let isAdmin = false;
    if (command.adminOnly && isGroup) {
      // TODO: get group admins
      isAdmin = isOwner;
      if (!isAdmin) {
        await sock.sendMessage(from, {
          text: "❌ This command is only for group admins.",
        });
        return;
      }
    }

    const now = Date.now();
    const cooldownAmount = (command.cooldown || 0) * 1000;
    if (cooldownAmount > 0) {
      const timestamps = command.lastExecuted!;
      const expirationTime = (timestamps.get(senderJid) ?? 0) + cooldownAmount;
      if (now < expirationTime) {
        const timeLeft = Math.ceil((expirationTime - now) / 1000);
        await sock.sendMessage(from, {
          text: `⏳ Please wait ${timeLeft} second(s) before using \`${command.name}\` again.`,
        });
        return;
      }
      timestamps.set(senderJid, now);
    }

    const context: ICommandContext = {
      sock,
      commandHandler: this,
      sessionId,
    };

    try {
      logger.info(
        `Executing command: ${command.name} by ${senderJid} in ${from} (Session: ${sessionId})`
      );
      await command.execute(message, args, context);
    } catch (error) {
      logger.error(
        `Error executing command ${command.name} in session ${sessionId}:`,
        error
      );
      await sock.sendMessage(from, {
        text: `❌ An error occurred while executing the command.`,
      });
    }
  }

  private getMessageContent(message: proto.IWebMessageInfo): string | null {
    if (message.message?.conversation) {
      return message.message.conversation;
    }
    if (message.message?.extendedTextMessage?.text) {
      return message.message.extendedTextMessage.text;
    }
    return null;
  }
}
