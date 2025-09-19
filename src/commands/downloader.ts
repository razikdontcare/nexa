import type { CommandModule } from "../application/commands/Command.js";
import type { proto } from "@whiskeysockets/baileys";

type CobaltGeneralKeys =
  | "audioBitrate"
  | "audioFormat"
  | "downloadMode"
  | "filenameStyle"
  | "videoQuality"
  | "disableMetadata"
  | "alwaysProxy"
  | "localProcessing"
  | "subtitleLang";

type CobaltServiceKeys =
  | "youtubeVideoCodec"
  | "youtubeVideoContainer"
  | "youtubeDubLang"
  | "convertGif"
  | "allowH265"
  | "tiktokFullAudio"
  | "youtubeBetterAudio"
  | "youtubeHLS";

const ALLOWED_KEYS = new Set<CobaltGeneralKeys | CobaltServiceKeys>([
  "audioBitrate",
  "audioFormat",
  "downloadMode",
  "filenameStyle",
  "videoQuality",
  "disableMetadata",
  "alwaysProxy",
  "localProcessing",
  "subtitleLang",
  "youtubeVideoCodec",
  "youtubeVideoContainer",
  "youtubeDubLang",
  "convertGif",
  "allowH265",
  "tiktokFullAudio",
  "youtubeBetterAudio",
  "youtubeHLS",
]);

function extractQuotedText(m: proto.IWebMessageInfo): string | undefined {
  const c = m?.message as any;
  const ctx =
    c?.extendedTextMessage?.contextInfo ||
    c?.imageMessage?.contextInfo ||
    c?.videoMessage?.contextInfo;
  const q = ctx?.quotedMessage as proto.IMessage | undefined;
  if (!q) return undefined;
  return (
    (q as any)?.conversation ||
    (q as any)?.extendedTextMessage?.text ||
    (q as any)?.imageMessage?.caption ||
    (q as any)?.videoMessage?.caption ||
    undefined
  );
}

function findFirstUrl(text?: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/https?:\/\/\S+/i);
  return m?.[0];
}

function parseFlags(args: string[]): {
  url?: string;
  options: Record<string, string | boolean>;
} {
  const options: Record<string, string | boolean> = {};
  let url: string | undefined;
  for (const a of args) {
    if (/^https?:\/\//i.test(a)) {
      // prefer the first URL token as the source
      if (!url) url = a;
      continue;
    }
    if (a.startsWith("--")) {
      const body = a.slice(2);
      if (!body) continue;
      const eq = body.indexOf("=");
      let key = body;
      let val: string | boolean = true;
      if (eq >= 0) {
        key = body.slice(0, eq);
        val = body.slice(eq + 1);
      }
      if (ALLOWED_KEYS.has(key as any)) {
        // normalize booleans if provided as strings
        if (String(val).toLowerCase() === "true") val = true;
        else if (String(val).toLowerCase() === "false") val = false;
        options[key] = val;
      }
    }
  }
  return { url, options };
}

type TunnelOrRedirect = {
  status: "tunnel" | "redirect";
  url: string;
  filename?: string;
};
type LocalProcessing = {
  status: "local-processing";
  type: "merge" | "mute" | "audio" | "gif" | "remux";
  service: string;
  tunnel: string[];
  output: {
    type: string;
    filename: string;
    metadata?: Record<string, string>;
    subtitles?: boolean;
  };
  audio?: {
    copy?: boolean;
    format?: string;
    bitrate?: string;
    cover?: boolean;
    cropCover?: boolean;
  };
  isHLS?: boolean;
};
type Picker = {
  status: "picker";
  audio?: string;
  audioFilename?: string;
  picker: { type: "photo" | "video" | "gif"; url: string; thumb?: string }[];
};
type Err = {
  status: "error";
  error: { code: string; context?: { service?: string; limit?: number } };
};

const command: CommandModule = {
  name: "downloader",
  aliases: ["download", "dl"],
  summary: "Download media on supported platforms (YouTube, TikTok, etc.)",
  usage:
    "{prefix}downloader <url> [--downloadMode=audio|auto|mute] [--videoQuality=720] [--audioFormat=mp3]",
  examples: [
    "{prefix}downloader https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "{prefix}downloader https://x.com/... --downloadMode=audio --audioFormat=mp3 --audioBitrate=192",
  ],
  cooldownMs: 4000,
  run: async ({ reply, args, message, sock, from, chatPrefix }) => {
    // Determine the source URL and flags
    const quotedUrl = findFirstUrl(extractQuotedText(message));
    const joined = args.join(" ");
    const inlineUrl = findFirstUrl(joined);
    const { url: flagUrl, options } = parseFlags(args);
    const srcUrl = flagUrl || inlineUrl || quotedUrl;

    if (!srcUrl) {
      await reply({
        text: "Usage: {prefix}downloader <url> [--downloadMode=audio|auto|mute] [--videoQuality=720] [--audioFormat=mp3]".replace(
          /\{prefix\}/g,
          chatPrefix
        ),
      });
      return;
    }

    // Choose API base: use special TikTok endpoint when the source is TikTok; otherwise use env base
    // This condition is for my internal use because there is a problem with tiktok in my Cobalt instance
    // You can remove this condition if you don't need it
    const isTikTok = (() => {
      try {
        const u = new URL(srcUrl);
        return /tiktok\./i.test(u.hostname);
      } catch {
        return /tiktok/i.test(srcUrl);
      }
    })();
    const base = isTikTok
      ? (
          process.env.COBALT_BASE_URL ||
          process.env.COBALT_TIKTOK_BASE_URL ||
          ""
        )
          .trim()
          .replace(/\/$/, "")
      : (process.env.COBALT_BASE_URL || "").trim().replace(/\/$/, "");
    if (!base) {
      await reply({
        text: "COBALT_BASE_URL is not set. Please add it to your environment (e.g., https://cobalt.example.com).",
      });
      return;
    }

    const body = { url: srcUrl, ...options } as Record<string, any>;

    try {
      const res = await fetch(`${base}${isTikTok ? "" : "/"}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as
        | TunnelOrRedirect
        | LocalProcessing
        | Picker
        | Err
        | { status: string; [k: string]: any };

      if (!res.ok) {
        await reply({
          text: `Cobalt error (${res.status}): ${
            (data as any)?.error?.code || res.statusText
          }`,
        });
        return;
      }

      switch (data.status) {
        case "tunnel":
        case "redirect": {
          const { url, filename } = data as TunnelOrRedirect;
          // Prefer sending as video; if that fails, try audio by extension, then document, then text link.
          const name = (filename || "download").toLowerCase();
          const isAudio = /\.(mp3|m4a|aac|ogg|opus|wav|flac)(?:\?|$)/i.test(
            name
          );
          try {
            if (isAudio) {
              await sock.sendMessage(
                from,
                {
                  audio: { url },
                  mimetype: "audio/mpeg",
                  fileName: filename || "audio",
                },
                { quoted: message }
              );
            } else {
              await sock.sendMessage(
                from,
                { video: { url }, caption: filename || undefined },
                { quoted: message }
              );
            }
          } catch {
            try {
              await sock.sendMessage(
                from,
                {
                  document: { url },
                  fileName: filename || "download",
                  mimetype: "application/octet-stream",
                },
                { quoted: message }
              );
            } catch {
              await reply({
                text: `Download ready:\nFilename: ${
                  filename || "(unknown)"
                }\nURL: ${url}`,
              });
            }
          }
          return;
        }
        case "local-processing": {
          const lp = data as LocalProcessing;
          const lines = [
            `Local processing required (${lp.type}) from ${lp.service}.`,
            `Output: ${lp.output.filename} (${lp.output.type})`,
            `Tunnels (${lp.tunnel.length}):`,
            ...lp.tunnel.slice(0, 10).map((u, i) => `${i + 1}. ${u}`),
          ];
          if (lp.tunnel.length > 10)
            lines.push(`...and ${lp.tunnel.length - 10} more`);
          lines.push(
            "Tip: Use ffmpeg to merge/mux the tunnels on your machine."
          );
          await reply({ text: lines.join("\n") });
          return;
        }
        case "picker": {
          const pk = data as Picker;
          await reply({
            text: `Found ${pk.picker.length}${
              pk.audio ? "+1 audio" : ""
            } item(s). Sending all...`,
          });

          // Helper to process a single picker URL via cobalt then send
          const processItem = async (
            itemUrl: string,
            hint?: { type?: "photo" | "video" | "gif"; filename?: string }
          ) => {
            try {
              const r = await fetch(`${base}/`, {
                method: "POST",
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ url: itemUrl, ...options }),
              });
              const d = (await r.json()) as
                | TunnelOrRedirect
                | LocalProcessing
                | Picker
                | Err
                | { status: string };
              if (!r.ok) {
                await reply({
                  text: `Cobalt item error (${r.status}): ${
                    (d as any)?.error?.code || r.statusText
                  }`,
                });
                return;
              }
              if (d.status === "tunnel" || d.status === "redirect") {
                const { url, filename } = d as TunnelOrRedirect;
                const name = (
                  filename ||
                  hint?.filename ||
                  "download"
                ).toLowerCase();
                const isAudio =
                  /\.(mp3|m4a|aac|ogg|opus|wav|flac)(?:\?|$)/i.test(name);
                try {
                  if (hint?.type === "photo") {
                    await sock.sendMessage(
                      from,
                      { image: { url }, caption: filename || undefined },
                      { quoted: message }
                    );
                  } else if (hint?.type === "gif") {
                    await sock.sendMessage(
                      from,
                      {
                        video: { url },
                        gifPlayback: true,
                        caption: filename || undefined,
                      },
                      { quoted: message }
                    );
                  } else if (isAudio) {
                    await sock.sendMessage(
                      from,
                      {
                        audio: { url },
                        mimetype: "audio/mpeg",
                        fileName: filename || "audio",
                      },
                      { quoted: message }
                    );
                  } else {
                    await sock.sendMessage(
                      from,
                      { video: { url }, caption: filename || undefined },
                      { quoted: message }
                    );
                  }
                } catch {
                  try {
                    await sock.sendMessage(
                      from,
                      {
                        document: { url },
                        fileName: filename || "download",
                        mimetype: "application/octet-stream",
                      },
                      { quoted: message }
                    );
                  } catch {
                    await reply({
                      text: `Item ready:\nFilename: ${
                        filename || "(unknown)"
                      }\nURL: ${url}`,
                    });
                  }
                }
              } else if (d.status === "local-processing") {
                const lp = d as LocalProcessing;
                const lines = [
                  `Local processing required (${lp.type}) from ${lp.service}.`,
                  `Output: ${lp.output.filename} (${lp.output.type})`,
                  `Tunnels (${lp.tunnel.length}):`,
                  ...lp.tunnel.slice(0, 10).map((u, i) => `${i + 1}. ${u}`),
                ];
                if (lp.tunnel.length > 10)
                  lines.push(`...and ${lp.tunnel.length - 10} more`);
                await reply({ text: lines.join("\n") });
              } else if (d.status === "picker") {
                // Rare, but handle nested picker by sending first-level items
                const nested = d as Picker;
                for (const it of nested.picker) {
                  await processItem(it.url, { type: it.type });
                }
              } else if (d.status === "error") {
                const e = d as Err;
                await reply({ text: `Cobalt item error: ${e.error.code}` });
              } else {
                await reply({
                  text: `Unexpected item response: ${(d as any)?.status}`,
                });
              }
            } catch (err: any) {
              await reply({
                text: `Failed to fetch item: ${err?.message || String(err)}`,
              });
            }
          };

          // If a background audio is present, attempt to send it first
          if (pk.audio) {
            try {
              await sock.sendMessage(
                from,
                {
                  audio: { url: pk.audio },
                  mimetype: "audio/mpeg",
                  fileName: pk.audioFilename || "audio",
                },
                { quoted: message }
              );
            } catch {
              // try via cobalt processing if direct send fails
              await processItem(pk.audio, { filename: pk.audioFilename });
            }
          }
          for (const item of pk.picker) {
            await processItem(item.url, { type: item.type });
          }
          return;
        }
        case "error": {
          const e = data as Err;
          const ctx = e.error.context || {};
          const extra = [
            ctx.service ? `service=${ctx.service}` : null,
            typeof ctx.limit === "number" ? `limit=${ctx.limit}` : null,
          ]
            .filter(Boolean)
            .join(", ");
          await reply({
            text: `Cobalt error: ${e.error.code}${extra ? ` (${extra})` : ""}`,
          });
          return;
        }
        default: {
          await reply({
            text: `Unexpected response from Cobalt: ${data.status}`,
          });
          return;
        }
      }
    } catch (err: any) {
      await reply({
        text: `Failed to contact Cobalt: ${err?.message || String(err)}`,
      });
    }
  },
};

export default command;
