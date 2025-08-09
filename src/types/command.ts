import { WASocket, proto } from "baileys";
import { CommandHandler } from "@/services/commandHandler.service";

export interface ICommandContext {
  sock: WASocket;
  commandHandler: CommandHandler;
  sessionId: string;
}

export interface ICommand {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  category?: string;
  cooldown?: number;
  ownerOnly?: boolean;
  groupOnly?: boolean;
  privateOnly?: boolean;
  adminOnly?: boolean;
  disabled?: boolean;

  execute: (
    message: proto.IWebMessageInfo,
    args: string[],
    context: ICommandContext
  ) => Promise<void>;
}

export interface ICommandInfo extends ICommand {
  filePath: string;
  lastExecuted?: Map<string, number>;
}
