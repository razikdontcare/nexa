import { proto } from "baileys";

export class Helpers {
  static extractMessageContent(msg: proto.IWebMessageInfo): string {
    if (msg.message?.conversation) {
      return msg.message.conversation;
    }

    if (msg.message?.extendedTextMessage?.text) {
      return msg.message.extendedTextMessage.text;
    }

    if (msg.message?.imageMessage?.caption) {
      return msg.message.imageMessage.caption;
    }
    
    if (msg.message?.videoMessage?.caption) {
      return msg.message.videoMessage.caption;
    }
    
    return '[Media Message]';
  }

  static validatePhoneNumber(phone: string): boolean {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone);
  }

  static formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters except +
    let formatted = phoneNumber.replace(/[^\d+]/g, '');
    
    // Ensure it starts with +
    if (!formatted.startsWith('+')) {
      formatted = '+' + formatted;
    }
    
    return formatted;
  }

  static generateSessionId(): string {
    const randomId = Math.random().toString(36).slice(2, 2 + 9);
    return `session_${Date.now()}_${randomId}`
  }
}
