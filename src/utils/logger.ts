import winston from "winston";
import pino from "pino";
import path from "path";
import fs from "fs";

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "nexa" },
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), "logs", "error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: path.join(process.cwd(), "logs", "combined.log"),
    }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

// -- Pino logger (for Baileys) --
const pinoLevel = process.env.LOG_LEVEL || "info";

export const pinoLogger = pino({
  name: "baileys",
  level: pinoLevel,
  transport: {
    target: "pino/file",
    options: {
      destination: path.join(process.cwd(), "logs", "baileys.log"),
    },
  },
});

const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}
