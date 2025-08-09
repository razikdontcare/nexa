import mongoose from "mongoose";
import { logger } from "@/utils/logger";

export class DatabaseConfig {
    static async connect(): Promise<void> {
        try {
            const connection = await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/whatsapp_bot")
            logger.info("MongoDB connected successfully")
            // return connection;
        } catch (error) {
            logger.error("MongoDB connection failed", error);
            process.exit(1);
        }
    }

    static async disconnect(): Promise<void> {
        try {
            await mongoose.disconnect();
            logger.info("MongoDB disconnected.");
        } catch (error) {
            logger.error("MongoDB disconnection failed", error);
        }
    }
}