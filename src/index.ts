import "dotenv/config";
import { ServerConfig } from "@/config/server";
import { DatabaseConfig } from "@/config/database";
import { logger } from "@/utils/logger";
import { ErrorMiddleware } from "@/middleware/error.middleware";
import whatsappRoutes from "@/routes/whatsapp.routes";
import { configService } from "@/services/config.service";
import { WhatsAppService } from "@/services/whatsapp.service";
import { Session } from "@/models/Session";

async function restoreExistingSessions(): Promise<void> {
  try {
    logger.info("Checking for existing sessions to restore...");

    // Find sessions that were connected before the restart
    const existingSessions = await Session.find({
      status: { $in: ["connected", "qr_required"] },
    });

    if (existingSessions.length === 0) {
      logger.info("No existing sessions found to restore.");
      return;
    }

    logger.info(`Found ${existingSessions.length} session(s) to restore.`);

    // Restore each session
    for (const session of existingSessions) {
      try {
        logger.info(`Attempting to restore session: ${session.sessionId}`);

        // Set status to connecting while we attempt to restore
        await Session.findOneAndUpdate(
          { sessionId: session.sessionId },
          { status: "connecting" }
        );

        // Create the session (this will attempt to reconnect)
        await WhatsAppService.createSession(session.sessionId, session.name);

        logger.info(`Session ${session.sessionId} restoration initiated.`);
      } catch (error) {
        logger.error(`Failed to restore session ${session.sessionId}:`, error);

        // Mark as disconnected if restoration fails
        await Session.findOneAndUpdate(
          { sessionId: session.sessionId },
          { status: "disconnected" }
        ).catch((err) =>
          logger.error(
            `Failed to update session status for ${session.sessionId}:`,
            err
          )
        );
      }
    }
  } catch (error) {
    logger.error("Error during session restoration:", error);
  }
}

async function bootstrap(): Promise<void> {
  try {
    // 1. Initialize database FIRST
    await DatabaseConfig.connect();

    // 2. Initialize ConfigService AFTER database is connected
    await configService.initialize();

    // 3. Initialize Command Handler (uses configService)
    await WhatsAppService.initializeCommandHandler();

    // 4. Restore existing sessions (reconnect previously connected sessions)
    await restoreExistingSessions();

    // 5. Initialize server
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
