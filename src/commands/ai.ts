import type { CommandModule } from "../application/commands/Command.js";
import Groq from "groq-sdk";
import { getOrCreateAiConfig } from "../infrastructure/repositories/ai-config.repo.js";
import {
  appendConversationMessages,
  getConversationContext,
  maybeSummarizeConversation,
} from "../infrastructure/repositories/ai-conversation.repo.js";
import { listMemories, saveMemory } from "../infrastructure/repositories/ai-memory.repo.js";
import { tavilySearch } from "../infrastructure/tools/tavily.js";
import type { proto } from "@whiskeysockets/baileys";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
};

function extractQuotedText(m: proto.IWebMessageInfo): string | undefined {
  const c = m?.message as any;
  const ctx = c?.extendedTextMessage?.contextInfo || c?.imageMessage?.contextInfo || c?.videoMessage?.contextInfo;
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

const command: CommandModule = {
  name: "ai",
  aliases: ["gpt", "ask"],
  summary: "Ask Nexa AI a question",
  usage: "/ai <question>",
  examples: ["/ai What is pathfinding?"],
  ownerOnly: false,
  cooldownMs: 2000,
  run: async ({ reply, args, from, sender, message }) => {
    const question = (args && args.length ? args.join(" ") : extractQuotedText(message))?.trim();
    if (!question) {
      await reply({ text: "Usage: /ai <question> or reply /ai to a message" });
      return;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      await reply({ text: "GROQ_API_KEY is not set. Please configure it in your environment." });
      return;
    }

    const aiCfg = await getOrCreateAiConfig();
    const groq = new Groq({ apiKey });

    // Build base context: system + user identity + summary + recent messages + memories
    const senderName = String((message as any)?.pushName || "").trim();
    const memories = await listMemories({ remoteJid: from, sender });
    // If we know the sender's display name and it's not stored yet, persist as a stable user memory
    try {
      if (senderName && !memories.some((m) => m.scope === "user" && m.key === "name")) {
        await saveMemory({ remoteJid: from, sender, key: "name", value: senderName, scope: "user" });
      }
    } catch {}
    const memoryText = memories.length
      ? `Known memories for this user/chat (may be incomplete):\n` +
        memories.map((m) => `- [${m.scope}] ${m.key}: ${m.value}`).join("\n")
      : "";

    const systemParts = [aiCfg.systemPrompt?.trim() || "You are a helpful AI assistant."];
    // Add immediate identity context so the model knows who it is talking to
    if (senderName) {
      systemParts.push(`You are currently conversing with: ${senderName}. If you address the user directly, use their name naturally.`);
    } else {
      systemParts.push(`You are currently conversing with a user (JID: ${sender}). Address them politely.`);
    }
    if (aiCfg.enableWebSearch) {
      systemParts.push(
        "You can use the web_search tool for current events or when additional information is needed."
      );
    }
    if (memoryText) systemParts.push(memoryText);

    const systemMessage: ChatMessage = { role: "system", content: systemParts.join("\n\n").trim() };

    const ctx = await getConversationContext(from, {
      maxContextChars: aiCfg.maxContextChars,
      maxMessages: aiCfg.maxMessages,
    });

    const messages: ChatMessage[] = [systemMessage];
    if (ctx.summary) messages.push({ role: "system", content: `Conversation summary so far:\n${ctx.summary}` });
    for (const m of ctx.messages) messages.push(m as ChatMessage);

    const userMsg: ChatMessage = { role: "user", content: question, name: senderName || undefined };
    messages.push(userMsg);

    // Define tools
    const toolDefinitions: any[] = [
      {
        type: "function",
        // Some Groq harmony paths expect a top-level name; duplicate for safety.
        name: "web_search",
        function: {
          name: "web_search",
          description:
            "Search the web for up-to-date information using Tavily. Use for current events, factual lookups, or when you lack enough context.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query in natural language" },
              max_results: {
                type: "integer",
                minimum: 1,
                maximum: 10,
                default: 5,
                description: "Maximum number of results to return",
              },
              search_depth: {
                type: "string",
                enum: ["basic", "advanced"],
                description: "Use 'advanced' for deeper research when needed",
              },
            },
            required: ["query"],
          },
        },
      },
      {
        type: "function",
        name: "save_memory",
        function: {
          name: "save_memory",
          description:
            "Save an important short fact about the user or chat to help future responses (e.g., user's name, preferences). Use sparingly for stable facts.",
          parameters: {
            type: "object",
            properties: {
              key: { type: "string", description: "Memory key, e.g., 'name' or 'favorite_color'" },
              value: { type: "string", description: "Memory value" },
              scope: {
                type: "string",
                enum: ["user", "chat"],
                description: "Whether memory applies to the specific user or the chat",
                default: "user",
              },
            },
            required: ["key", "value"],
          },
        },
      },
    ];

    // Helper to run the model and optionally execute tools
    async function runOnce(msgs: ChatMessage[]) {
      const effectiveTools = aiCfg.enableWebSearch
        ? toolDefinitions
        : toolDefinitions.filter((t: any) => t.function?.name !== "web_search")
      const resp = await groq.chat.completions.create({
        model: aiCfg.model,
        temperature: typeof aiCfg.temperature === "number" ? aiCfg.temperature : 0.5,
        messages: msgs as any,
        tools: effectiveTools as any,
        tool_choice: "auto",
      } as any);
      const choice = resp.choices?.[0];
      const msg = choice?.message as any;
      return msg;
    }

    // Execute, handling up to 2 tool-use rounds
    const transcript: ChatMessage[] = [...messages];
    let assistantMsg = await runOnce(transcript);

    // Handle function_call (legacy) or tool_calls (structured)
    let rounds = 0;
    while (assistantMsg && (assistantMsg.function_call || assistantMsg.tool_calls?.length) && rounds < 2) {
      rounds++;
      const toolCalls = assistantMsg.tool_calls || (assistantMsg.function_call ? [{
        id: "func_legacy",
        type: "function",
        function: assistantMsg.function_call,
      }] : []);

      // Push the assistant tool-call message verbatim so tool_calls are preserved
      transcript.push(assistantMsg as any);

      for (const call of toolCalls) {
        const fn = call.function?.name;
        let args: any = {};
        try { args = call.function?.arguments ? JSON.parse(call.function.arguments) : {}; } catch { args = {}; }

        if (fn === "web_search") {
          const apiKey = process.env.TAVILY_API_KEY;
          let toolContent = "";
          if (!apiKey) {
            toolContent = "Tavily API key not configured. Unable to perform search.";
          } else {
            try {
              const result = await tavilySearch({
                apiKey,
                query: String(args.query || ""),
                maxResults: typeof args.max_results === "number" ? args.max_results : 5,
                searchDepth: typeof args.search_depth === "string" ? args.search_depth : undefined,
              });
              toolContent = result;
            } catch (err: any) {
              toolContent = `Search failed: ${err?.message || String(err)}`;
            }
          }
          transcript.push({
            role: "tool",
            tool_call_id: call.id,
            content: toolContent,
          });
        } else if (fn === "save_memory") {
          try {
            const key = String(args.key || "").trim();
            const value = String(args.value || "").trim();
            const scope = (args.scope === "chat" ? "chat" : "user") as "chat" | "user";
            if (key && value) {
              await saveMemory({ remoteJid: from, sender, key, value, scope });
              transcript.push({ role: "tool", tool_call_id: call.id, content: `Saved memory: ${scope}:${key}=${value}` });
            } else {
              transcript.push({ role: "tool", tool_call_id: call.id, content: `Invalid memory payload` });
            }
          } catch (err: any) {
            transcript.push({ role: "tool", tool_call_id: call.id, content: `Failed to save memory: ${err?.message || String(err)}` });
          }
        } else {
          transcript.push({ role: "tool", tool_call_id: call.id, content: `Unknown tool: ${fn}` });
        }
      }

      // Ask model to continue with results
      assistantMsg = await runOnce(transcript);
    }

    // Finalize assistant text
    const finalText = String(assistantMsg?.content || "I don't have a response right now.").trim();
    await reply({ text: finalText });

    // Persist conversation and maybe summarize
    try {
      const toStore: ChatMessage[] = [userMsg];
      // Optionally include tool messages and the assistant with blank content replaced
      const storedAssistant: ChatMessage = { role: "assistant", content: finalText };
      toStore.push(storedAssistant);
      await appendConversationMessages(from, toStore);
      await maybeSummarizeConversation(from, groq, aiCfg);
    } catch {}
  },
};

export default command;
