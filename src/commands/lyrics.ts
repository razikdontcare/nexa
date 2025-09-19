import type { CommandModule } from "../application/commands/Command.js";

// Define argument schema (adjust as needed)
type LyricsResponse = {
  id: number;
  name: string;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string;
  syncedLyrics: string;
};

const command: CommandModule = {
  name: "lyrics",
  aliases: ["ly", "lirik", "lyric", "li"],
  summary: "Fetch song lyrics",
  usage: "/lyrics <song name>",
  examples: ["/lyrics Imagine Dragons Believer"],
  ownerOnly: false,
  cooldownMs: 2000,
  run: async ({ reply, args, body }) => {
    const query = args?.length ? args.join(" ") : body || "";
    if (!query) {
      await reply({ text: "Usage: " + (command.usage || "") });
      return;
    }
    const BASE = "https://lrclib.net";

    const url = new URL("/api/search", BASE);
    url.searchParams.set("q", query);

    try {
      const res = await fetch(url);
      const data = (await res.json())[0] as LyricsResponse | undefined;
      if (!data || !data.plainLyrics) {
        await reply({ text: `No lyrics found for "${query}".` });
        return;
      }
      const text = `*${data.trackName}* - _${
        data.artistName
      }_\n\n${data.plainLyrics.trim()}`;
      if (text.length <= 4096) {
        await reply({ text });
      } else {
        await reply({
          text: `Lyrics too long (${text.length} chars).`,
        });
      }
    } catch {}
  },
};

export default command;
