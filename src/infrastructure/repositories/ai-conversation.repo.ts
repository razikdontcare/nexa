import type { Collection } from "mongodb";
import { getCollection } from "../db/mongo.js";

export type AiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
};

export type AiConversationDoc = {
  _id: string; // remoteJid
  summary?: string;
  messages: AiMessage[];
  createdAt: Date;
  updatedAt: Date;
};

export type ContextOptions = {
  maxContextChars?: number;
  maxMessages?: number;
};

let colPromise: Promise<Collection<AiConversationDoc>> | null = null;
async function getCol() {
  if (!colPromise)
    colPromise = getCollection<AiConversationDoc>("ai_conversations");
  return colPromise;
}

export async function getConversationContext(
  remoteJid: string,
  opts?: ContextOptions
): Promise<{ summary?: string; messages: AiMessage[] }> {
  const col = await getCol();
  const doc = await col.findOne({ _id: remoteJid });
  if (!doc) return { summary: undefined, messages: [] };
  const maxChars = Math.max(1000, Number(opts?.maxContextChars || 8000));
  const maxMsgs = Math.max(4, Number(opts?.maxMessages || 20));
  // take the last messages respecting both msg count and rough char budget
  const msgs = doc.messages || [];
  const tail: AiMessage[] = [];
  let chars = 0;
  for (let i = msgs.length - 1; i >= 0 && tail.length < maxMsgs; i--) {
    const m = msgs[i];
    chars += (m?.content || "").length;
    if (chars > maxChars) break;
    tail.push(m);
  }
  tail.reverse();
  return { summary: doc.summary, messages: tail };
}

export async function appendConversationMessages(
  remoteJid: string,
  newMessages: AiMessage[]
): Promise<void> {
  if (!newMessages?.length) return;
  const col = await getCol();
  const now = new Date();
  await col.updateOne(
    { _id: remoteJid },
    {
      $push: { messages: { $each: newMessages } },
      $setOnInsert: { createdAt: now },
      $set: { updatedAt: now },
    },
    { upsert: true }
  );
}

function serializeTranscript(messages: AiMessage[]): string {
  return messages
    .map((m) => {
      const role = m.role.toUpperCase();
      const content = (m.content || "").trim();
      return `(${role}) ${content}`;
    })
    .join("\n");
}

export async function maybeSummarizeConversation(
  remoteJid: string,
  groq: any,
  cfg: { model: string; maxContextChars?: number }
) {
  try {
    const col = await getCol();
    const doc = await col.findOne({ _id: remoteJid });
    if (!doc) return;
    const totalChars = (doc.messages || []).reduce(
      (acc, m) => acc + (m.content?.length || 0),
      0
    );
    const maxChars = Math.max(1000, Number(cfg.maxContextChars || 8000));
    if (totalChars < maxChars * 1.5) return;

    // summarize all but the last few messages
    const keep = 8;
    const older = (doc.messages || []).slice(
      0,
      Math.max(0, (doc.messages || []).length - keep)
    );
    if (!older.length) return;
    const previousSummary = doc.summary || "";
    const transcript = serializeTranscript(older);

    const prompt = [
      "Summarize the following conversation succinctly as a running memory.",
      "Focus on stable facts, decisions, preferences, names, and key context.",
      "Keep it under ~12 sentences. Avoid verbatim quotes.",
      previousSummary
        ? `Previous summary for context:\n${previousSummary}`
        : "",
      `Transcript to summarize:\n${transcript}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const msg = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      messages: [
        { role: "system", content: "You are a concise summarizer." },
        { role: "user", content: prompt },
      ],
    });
    const summary = (msg.choices?.[0]?.message?.content || "").trim();
    if (!summary) return;

    const now = new Date();
    await col.updateOne(
      { _id: remoteJid },
      {
        $set: { summary, updatedAt: now },
        $push: { messages: { $each: [], $slice: -keep } },
      },
      { upsert: true }
    );
  } catch {}
}
