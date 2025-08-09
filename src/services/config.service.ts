import type { IBotConfig } from "@/types";
import { BotConfig } from "@/models/BotConfig";
import { logger } from "@/utils/logger";

const DEFAULT_CONFIG: Record<
  string,
  {
    value: any;
    type: IBotConfig["type"];
    description: string;
    category: string;
  }
> = {
  commandPrefix: {
    value: process.env.COMMAND_PREFIX || "!",
    type: "string",
    description: "Prefix used to trigger commands",
    category: "General",
  },
  ownerJid: {
    value: process.env.OWNER_JID || "",
    type: "string",
    description: "JID of the bot owner",
    category: "Security",
  },
  botName: {
    value: "Nexa AI",
    type: "string",
    description: "Display name of the bot",
    category: "General",
  },
};

export class ConfigService {
  private static instance: ConfigService;
  private cache: Map<string, any> = new Map();
  private initialized = false;

  private constructor() {}

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn("ConfigService is already initialized.");
      return;
    }

    logger.info("Initializing ConfigService...");
    try {
      for (const [key, configData] of Object.entries(DEFAULT_CONFIG)) {
        await BotConfig.findOneAndUpdate(
          { key },
          {
            key,
            value: configData.value,
            type: configData.type,
            description: configData.description,
            category: configData.category,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }

      if (process.env.OWNER_JID) {
        await this.set("ownerJid", process.env.OWNER_JID, "string");
      }
      if (process.env.COMMAND_PREFIX) {
        await this.set("commandPrefix", process.env.COMMAND_PREFIX, "string");
      }
      if (process.env.BOT_NAME) {
        await this.set("botName", process.env.BOT_NAME, "string");
      }

      await this.loadAll();

      this.initialized = true;
      logger.info("ConfigService initialized successfully.");
    } catch (error) {
      logger.error("Error initializing ConfigService:", error);
      throw error;
    }
  }

  private async loadAll(): Promise<void> {
    try {
      const configs = await BotConfig.find({});
      this.cache.clear();
      for (const config of configs) {
        this.cache.set(config.key, config.value);
      }
      logger.debug(`Loaded ${configs.length} configuration items into cache.`);
    } catch (error) {
      logger.error("Error loading configurations into cache:", error);
      throw error;
    }
  }

  get<T>(key: string, defaultValue?: T): T {
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }

    if (key in DEFAULT_CONFIG) {
      return DEFAULT_CONFIG[key].value as T;
    }

    return defaultValue as T;
  }

  async set(
    key: string,
    value: any,
    type?: IBotConfig["type"],
    description?: string,
    category?: string
  ): Promise<void> {
    try {
      let determinedType: IBotConfig["type"] = type || "string";
      if (!type) {
        const existingConfig = await BotConfig.findOne({ key });
        if (existingConfig) {
          determinedType = existingConfig.type;
        } else {
          if (typeof value === "boolean") determinedType = "boolean";
          else if (typeof value === "number") determinedType = "number";
          else if (typeof value === "object" && value !== null)
            determinedType = "object";
          else determinedType = "string";
        }
      }

      await BotConfig.findOneAndUpdate(
        { key },
        {
          key,
          value,
          type: determinedType,
          description: description || DEFAULT_CONFIG[key]?.description,
          category: category || DEFAULT_CONFIG[key]?.category || "General",
        },
        { upsert: true, new: true }
      );

      this.cache.set(key, value);
      logger.info(`Configuration updated: ${key} = ${JSON.stringify(value)}`);
    } catch (error) {
      logger.error(`Error setting configuration ${key}:`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await BotConfig.deleteOne({ key });
      this.cache.delete(key);
      logger.info(`Configuration deleted: ${key}`);
    } catch (error) {
      logger.error(`Error deleting configuration ${key}:`, error);
      throw error;
    }
  }

  async getAll(): Promise<IBotConfig[]> {
    try {
      await this.loadAll();
      return await BotConfig.find({});
    } catch (error) {
      logger.error("Error getting all configurations:", error);
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export const configService = ConfigService.getInstance();
