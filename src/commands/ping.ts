import { ICommand } from "@/types/command";
import { proto } from "baileys";

const ping: ICommand = {
  name: "ping",
  aliases: ["p"],
  description: "Check if the bot is alive",
  category: "General",
  cooldown: 5,

  execute: async (
    message: proto.IWebMessageInfo,
    args: string[],
    context
  ): Promise<void> => {
    const { sock } = context;
    const from = message.key.remoteJid!;
    await sock.sendMessage(from, { text: "🏓 Pong!" });
  },
};

export default ping;
