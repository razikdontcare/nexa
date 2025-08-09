import { Router } from "express";
import { WhatsAppController } from "@/controllers/whatsapp.controller";

const router = Router();

router.post("/sessions", WhatsAppController.createSession);
router.get("/sessions/:sessionId", WhatsAppController.getSession);
router.get("/sessions", WhatsAppController.getAllSessions);
router.delete("/sessions/:sessionId", WhatsAppController.deleteSession);

router.post("/send", WhatsAppController.sendMessage);

router.get("/sessions/:sessionId/qr", WhatsAppController.getQRCode);
router.get("/sessions/:sessionId/qr/image", WhatsAppController.getQRCodeImage);

router.get("/sessions/:sessionId/messages", WhatsAppController.getMessages);

router.post("/commands/reload", WhatsAppController.reloadCommands);
router.get("/commands/list", WhatsAppController.getCommandList);

router.get("/config", WhatsAppController.getConfig);
router.put("/config", WhatsAppController.updateConfig);

export default router;
