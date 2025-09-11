import dotenv from 'dotenv'

dotenv.config()

export const config = {
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
  mongodbDb: process.env.MONGODB_DB || 'nexa_bot',
  waDeviceName: process.env.WA_DEVICE_NAME || 'NexaBot',
  waPairingMode: (process.env.WA_PAIRING_MODE || 'qr').toLowerCase() as 'qr' | 'pair',
  botPrefix: process.env.BOT_PREFIX || '!',
  botOwnerJid: process.env.BOT_OWNER_JID || '',
  webPort: Number(process.env.PORT || 3000),
  showTerminalQR: String(process.env.WA_TERMINAL_QR || 'false').toLowerCase() === 'true',
  panelUser: process.env.PANEL_USER || 'admin',
  panelPass: process.env.PANEL_PASS || 'admin',
  typingIndicators: String(process.env.TYPING_INDICATORS || 'true').toLowerCase() === 'true',
  groupRateLimit: {
    max: Number(process.env.GROUP_RL_MAX || 15), // max commands
    windowMs: Number(process.env.GROUP_RL_WINDOW_MS || 30000), // per 30s
    muteMs: Number(process.env.GROUP_RL_MUTE_MS || 60000), // soft-mute 60s
  },
  allowGroupAdminsForOwnerOnly: String(process.env.ALLOW_ADMINS_OWNER_ONLY || 'false').toLowerCase() === 'true',
}
