import type { Collection } from "mongodb";
import { getCollection } from "../db/mongo.js";

export type AiConfigDoc = {
  _id: "default";
  model: string;
  temperature?: number;
  systemPrompt: string;
  enableWebSearch?: boolean;
  maxContextChars?: number;
  maxMessages?: number;
  createdAt: Date;
  updatedAt: Date;
};

let colPromise: Promise<Collection<AiConfigDoc>> | null = null;
async function getCol() {
  if (!colPromise) colPromise = getCollection<AiConfigDoc>("ai_config");
  return colPromise;
}

const DEFAULT_SYSTEM_PROMPT = `You are Nexa, a helpful WhatsApp assistant.
- Be concise and clear.
- Ask clarifying questions when needed.
- Use the web_search tool for current events or unknown facts.
- Save stable personal facts via save_memory when the user provides them (e.g., name, preferences).`;

export async function getOrCreateAiConfig(): Promise<AiConfigDoc> {
  const col = await getCol();
  let doc = await col.findOne({ _id: "default" });
  const now = new Date();
  if (!doc) {
    doc = {
      _id: "default",
      model: process.env.AI_MODEL || "openai/gpt-oss-120b",
      temperature: 0.5,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      enableWebSearch: true,
      maxContextChars: 8000,
      maxMessages: 20,
      createdAt: now,
      updatedAt: now,
    };
    await col.insertOne(doc);
  }
  return doc;
}

export async function updateAiConfig(
  patch: Partial<Omit<AiConfigDoc, "_id" | "createdAt" | "updatedAt">>
): Promise<AiConfigDoc> {
  const col = await getCol();
  const now = new Date();
  await col.updateOne(
    { _id: "default" },
    {
      $set: {
        ...patch,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );
  const doc = await col.findOne({ _id: "default" });
  if (!doc) throw new Error("Failed to load AI config after update");
  return doc;
}
