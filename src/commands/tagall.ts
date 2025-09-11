import { z } from "zod";
import type { CommandModule } from "../application/commands/Command.js";
import { cachedGroupMetadataLookup } from "../infrastructure/wa/group-cache.js";

// Define argument schema (adjust as needed)
const Args = z.object({
  // example: name: z.string().min(1)
});

const command: CommandModule = {
  name: "tagall",
  aliases: [],
  summary: "Mention all group participants",
  usage: "{prefix}tagall [message]",
  examples: ["{prefix}tagall", "{prefix}tagall Good morning!"],
  ownerOnly: false,
  cooldownMs: 2000,
  run: async ({ sock, from, isGroup, reply, message, args }) => {
    if (!isGroup) {
      await reply({ text: "This command can only be used in groups." });
      return;
    }

    // Try cached metadata first to avoid network fetches
    let participants: string[] | undefined;
    try {
      const meta = await cachedGroupMetadataLookup(from);
      participants = meta?.participants?.map((p) => p.id);
    } catch {}

    // Fallback: fetch once via API (wrapped to cache), if still missing
    if (!participants || participants.length === 0) {
      try {
        const meta = await (sock as any).groupMetadata(from);
        participants = meta?.participants?.map((p: any) => p.id) || [];
      } catch {
        participants = [];
      }
    }

    if (!participants || participants.length === 0) {
      await reply({ text: "Could not get group participants yet. Try again shortly." });
      return;
    }

    // Limit mentions to avoid overly long messages
    const MAX_MENTIONS = 200;
    const mentionList = participants.slice(0, MAX_MENTIONS);

    const baseText = args?.length ? args.join(" ") : "";
    const handles = mentionList
      .map((j) => "@" + j.split("@")[0].replace(/:\d+$/, ""))
      .join(" ");
    const text = baseText ? `${baseText}\n\n${handles}` : handles;

    await sock.sendMessage(
      from,
      { text, mentions: mentionList },
      { quoted: message }
    );
  },
};

export default command;
