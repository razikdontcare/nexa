import { Request, Response } from "express";
import { WhatsAppService } from "@/services/whatsapp.service";
import { logger } from "@/utils/logger";

export class WhatsAppController {
  static async createSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, name } = req.body;

      if (!sessionId || !name) {
        res.status(400).json({ error: "sessionId and name are required." });
        return;
      }

      await WhatsAppService.createSession(sessionId, name);

      res.status(201).json({
        success: true,
        message: `Session ${sessionId} created successfully.`,
        sessionId,
      });
    } catch (error) {
      logger.error("Error creating session:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create session.",
      });
    }
  }

  static async getSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const session = await WhatsAppService.getSession(sessionId);

      if (!session) {
        res.status(404).json({
          success: false,
          error: `Session ${sessionId} not found.`,
        });
        return;
      }

      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      logger.error("Error fetching session:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch session.",
      });
    }
  }

  static async getAllSessions(req: Request, res: Response): Promise<void> {
    try {
      const sessions = await WhatsAppService.getAllSessions();

      res.json({
        success: true,
        data: sessions,
      });
    } catch (error) {
      logger.error("Error getting sessions:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get sessions",
      });
    }
  }

  static async deleteSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      await WhatsAppService.deleteSession(sessionId);

      res.json({
        success: true,
        message: "Session deleted successfully",
      });
    } catch (error) {
      logger.error("Error deleting session:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete session",
      });
    }
  }
  static async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, to, message } = req.body;

      if (!sessionId || !to || !message) {
        res.status(400).json({
          success: false,
          error: "sessionId, to, and message are required",
        });
        return;
      }

      await WhatsAppService.sendMessage(sessionId, to, message);

      res.json({
        success: true,
        message: "Message sent successfully",
      });
    } catch (error) {
      logger.error("Error sending message:", error);
      res.status(500).json({
        success: false,
        error: "Failed to send message",
      });
    }
  }
  static async getQRCode(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const qrCode = await WhatsAppService.getQRCode(sessionId);

      if (!qrCode) {
        res.status(404).json({
          success: false,
          error: "QR code not available",
        });
        return;
      }

      res.json({
        success: true,
        data: { qrCode },
      });
    } catch (error) {
      logger.error("Error getting QR code:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get QR code",
      });
    }
  }
  static async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { limit = 50 } = req.query;

      const messages = await WhatsAppService.getMessages(
        sessionId,
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: messages,
      });
    } catch (error) {
      logger.error("Error getting messages:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get messages",
      });
    }
  }
  static async reloadCommands(req: Request, res: Response): Promise<void> {
    try {
      await WhatsAppService.reloadCommands();
      res.json({
        success: true,
        message: "Commands reloaded successfully",
      });
    } catch (error) {
      logger.error("Error reloading commands:", error);
      res.status(500).json({
        success: false,
        error: "Failed to reload commands",
      });
    }
  }
  static async getCommandList(req: Request, res: Response): Promise<void> {
    try {
      const commands = WhatsAppService.getCommandList();
      const categories = Object.fromEntries(
        WhatsAppService.getCommandsByCategory()
      );

      res.json({
        success: true,
        data: {
          commands,
          categories,
        },
      });
    } catch (error) {
      logger.error("Error getting command list:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get command list",
      });
    }
  }
  static async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const configs = await WhatsAppService.getConfig();
      res.json({
        success: true,
        data: configs,
      });
    } catch (error) {
      logger.error("Error getting config:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get configuration",
      });
    }
  }
  static async updateConfig(req: Request, res: Response): Promise<void> {
    try {
      const { key, value } = req.body;

      if (!key) {
        res.status(400).json({
          success: false,
          error: "Configuration key is required",
        });
        return;
      }

      await WhatsAppService.updateConfig(key, value);

      res.json({
        success: true,
        message: `Configuration '${key}' updated successfully`,
      });
    } catch (error) {
      logger.error("Error updating config:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update configuration",
      });
    }
  }
}
