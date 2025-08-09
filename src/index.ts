import "dotenv/config";
import { ServerConfig } from "@/config/server";
import { DatabaseConfig } from "@/config/database";
import { logger } from "@/utils/logger";
import { ErrorMiddleware } from "@/middleware/error.middleware";
import whatsappRoutes from "@/routes/whatsapp.routes";
import { configService } from "@/services/config.service";
import { WhatsAppService } from "@/services/whatsapp.service";

async function bootstrap(): Promise<void> {
  try {
    // 1. Initialize database FIRST
    await DatabaseConfig.connect();

    // 2. Initialize ConfigService AFTER database is connected
    await configService.initialize();

    // 3. Initialize Command Handler (uses configService)
    await WhatsAppService.initializeCommandHandler();

    // 4. Initialize server
    const server = new ServerConfig();

    // 5. Register routes
    server.app.use("/api/whatsapp", whatsappRoutes);

    // Health check endpoint
    server.app.get("/health", (req, res) => {
      res.json({
        status: "OK",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    // Error handling middleware
    server.app.use(ErrorMiddleware.handle);

    // 6. Start server
    server.listen();

    // Graceful shutdown
    process.on("SIGTERM", async () => {
      logger.info("SIGTERM received, shutting down gracefully");
      await DatabaseConfig.disconnect();
      process.exit(0);
    });

    process.on("SIGINT", async () => {
      logger.info("SIGINT received, shutting down gracefully");
      await DatabaseConfig.disconnect();
      process.exit(0);
    });
  } catch (error) {
    logger.error("Failed to start application:", error);
    process.exit(1);
  }
}

bootstrap();
