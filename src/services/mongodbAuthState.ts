import {
  AuthenticationState,
  AuthenticationCreds,
  SignalDataTypeMap,
  initAuthCreds,
  proto,
} from "baileys";
import { logger } from "@/utils/logger";
import { Session } from "@/models/Session";
import { AuthCreds } from "@/models/AuthCreds";
import { SignalKey } from "@/models/SignalKey";

export async function useMongoDBAuthState(
  sessionId: string
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  logger.info(`Initializing MongoDB auth state for session: ${sessionId}`);

  let credsDoc = await AuthCreds.findOne({ sessionId });
  let creds: AuthenticationCreds;

  if (!credsDoc) {
    creds = initAuthCreds();
    credsDoc = new AuthCreds({ sessionId, creds });
    await credsDoc.save();
    logger.info(`Created new AuthCreds document for session: ${sessionId}`);
  } else {
    creds = credsDoc.creds;
    logger.info(`Loaded existing AuthCreds for session: ${sessionId}`);
  }

  const saveCreds = async (): Promise<void> => {
    try {
      await AuthCreds.findOneAndUpdate(
        { sessionId },
        { creds, updatedAt: new Date() },
        { upsert: true, new: true }
      );
    } catch (error) {
      logger.error(`Failed to save creds for session ${sessionId}:`, error);
    }
  };

  const readData = async <K extends keyof SignalDataTypeMap>(
    type: K,
    ids: string[]
  ): Promise<{ [id: string]: SignalDataTypeMap[K] }> => {
    try {
      const data = await SignalKey.find({
        sessionId,
        keyType: type,
        keyId: { $in: ids },
      });

      const result: { [id: string]: SignalDataTypeMap[K] } = {} as any;
      for (const item of data) {
        result[item.keyId] = item.value as SignalDataTypeMap[K];
      }

      return result;
    } catch (error) {
      logger.error(
        `Failed to read data for session ${sessionId} and type ${type}:`,
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
      const operations = [];
      for (const key in data) {
        operations.push({
          updateOne: {
            filter: { sessionId, keyType: type, keyId: key },
            update: { $set: { value: data[key], updatedAt: new Date() } },
            upsert: true,
          },
        });
      }

      if (operations.length > 0) {
        await SignalKey.bulkWrite(operations, { ordered: false });
        logger.debug(
          `Saved ${operations.length} keys of type '${type}' for session: ${sessionId}`
        );
      }
    } catch (error) {
      logger.error(
        `Error writing data (${type}) for session ${sessionId}:`,
        error
      );
    }
  };

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = await readData(type, ids);
          return data;
        },
        set: async (data: { [pair: string]: any }) => {
          const tasks: Promise<void>[] = [];
          for (const type in data) {
            tasks.push(writeData(data[type], type as keyof SignalDataTypeMap));
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds,
  };
}
