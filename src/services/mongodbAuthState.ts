import {
  AuthenticationState,
  AuthenticationCreds,
  SignalDataTypeMap,
  initAuthCreds,
} from "baileys";
import { logger } from "@/utils/logger";
import { Session } from "@/models/Session";
import { AuthCreds } from "@/models/AuthCreds";
import { SignalKey } from "@/models/SignalKey";
import mongoose from "mongoose";

/**
 * Helper: Convert MongoDB buffer objects back to actual Buffer instances
 */
function restoreBuffers(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  // Check if this is a MongoDB buffer object
  if (
    obj &&
    typeof obj === "object" &&
    obj.type === "Buffer" &&
    Array.isArray(obj.data)
  ) {
    return Buffer.from(obj.data);
  }

  // Check if this is already a Buffer or Uint8Array
  if (Buffer.isBuffer(obj) || obj instanceof Uint8Array) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(restoreBuffers);
  }

  // Handle objects
  if (typeof obj === "object") {
    const restored: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        restored[key] = restoreBuffers(obj[key]);
      }
    }
    return restored;
  }

  return obj;
}

/**
 * Helper: shallow/recursive merge where props from `src` override `target`.
 * Keeps buffers, arrays, objects; primitive replaced.
 */
function mergeObjects(target: any, src: any): any {
  if (src === undefined || src === null) return target;
  if (
    typeof src !== "object" ||
    src instanceof Uint8Array ||
    Buffer.isBuffer(src)
  ) {
    return src;
  }
  if (Array.isArray(src)) {
    return src.slice();
  }
  const out: any = { ...(target && typeof target === "object" ? target : {}) };
  for (const k of Object.keys(src)) {
    out[k] = mergeObjects(out[k], src[k]);
  }
  return out;
}

export async function useMongoDBAuthState(
  sessionId: string
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  logger.info(`Initializing MongoDB auth state for session: ${sessionId}`);

  // load or create creds doc
  let credsDoc = await AuthCreds.findOne({ sessionId }).lean();
  let creds: AuthenticationCreds;

  if (!credsDoc) {
    creds = initAuthCreds();
    // save initial creds
    await AuthCreds.create({
      sessionId,
      creds,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    logger.info(`Created new AuthCreds document for session: ${sessionId}`);
  } else {
    // ensure plain object (lean() already returns POJO) and restore buffers
    creds = restoreBuffers(credsDoc.creds) as AuthenticationCreds;
    logger.info(`Loaded existing AuthCreds for session: ${sessionId}`);
  }

  /**
   * Save creds in a merge-safe way:
   * - read current DB creds
   * - merge DB and local creds (local overrides)
   * - write merged object with upsert
   *
   * This reduces the chance an instance overwrites keys owned by other instances.
   */
  const saveCreds = async (): Promise<void> => {
    try {
      // Read current DB creds (plain object)
      const current = await AuthCreds.findOne({ sessionId }).lean();
      const dbCreds = current?.creds ?? {};

      // Restore buffers in DB creds before merging
      const restoredDbCreds = restoreBuffers(dbCreds);

      // Merge: dbCreds + creds (local overrides)
      const merged = mergeObjects(
        restoredDbCreds,
        JSON.parse(JSON.stringify(creds))
      );

      await AuthCreds.findOneAndUpdate(
        { sessionId },
        { $set: { creds: merged, updatedAt: new Date() } },
        { upsert: true, new: true }
      );
      logger.debug(`Saved merged creds for session: ${sessionId}`);
    } catch (error) {
      logger.error(`Failed to save creds for session ${sessionId}:`, error);
    }
  };

  const readData = async <K extends keyof SignalDataTypeMap>(
    type: K,
    ids: string[]
  ): Promise<{ [id: string]: SignalDataTypeMap[K] }> => {
    try {
      const docs = await SignalKey.find({
        sessionId,
        keyType: type,
        keyId: { $in: ids },
      }).lean();

      const result: { [id: string]: SignalDataTypeMap[K] } = {} as any;
      for (const d of docs) {
        result[d.keyId] = restoreBuffers(d.value) as SignalDataTypeMap[K];
      }
      return result;
    } catch (error) {
      logger.error(
        `Failed to read data for session ${sessionId} and type ${String(
          type
        )}:`,
        error
      );
      return {} as { [id: string]: SignalDataTypeMap[K] };
    }
  };

  const writeData = async (
    data: { [key: string]: any },
    type: keyof SignalDataTypeMap
  ): Promise<void> => {
    try {
      const operations: any[] = [];
      for (const key in data) {
        // upsert each key; value stored as-is (mongoose will encode Buffer if present)
        operations.push({
          updateOne: {
            filter: { sessionId, keyType: type, keyId: key },
            update: {
              $set: { value: data[key], updatedAt: new Date() },
            },
            upsert: true,
          },
        });
      }

      if (operations.length > 0) {
        // unordered so one bad op won't stop others
        await SignalKey.bulkWrite(operations, { ordered: false });
        logger.debug(
          `Saved ${operations.length} keys of type '${String(
            type
          )}' for session: ${sessionId}`
        );
      }
    } catch (error) {
      logger.error(
        `Error writing data (${String(type)}) for session ${sessionId}:`,
        error
      );
    }
  };

  // expose state in shape Baileys expects
  const state: AuthenticationState = {
    creds,
    keys: {
      // Baileys may call get with specific type & ids
      get: async (type, ids) => {
        return await readData(type, ids);
      },
      // set receives an object keyed by keyType, each value is mapping keyId->value
      set: async (data: { [pair: string]: any }) => {
        const tasks: Promise<void>[] = [];
        for (const type in data) {
          // type is string at runtime; cast for TS
          tasks.push(writeData(data[type], type as keyof SignalDataTypeMap));
        }
        await Promise.all(tasks);
      },
    },
  };

  return {
    state,
    saveCreds,
  };
}
