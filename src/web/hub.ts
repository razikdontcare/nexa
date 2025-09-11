import { EventEmitter } from 'node:events'

// Simple event hub for QR & connection status updates to the web panel
export type ConnectionStatus = 'open' | 'close' | 'connecting' | 'unknown'

export interface HubEvents {
  qr: (qr: string) => void
  status: (status: ConnectionStatus) => void
  log: (data: any) => void
}

export const hub = new EventEmitter()

export function emitQR(qr: string) {
  hub.emit('qr', qr)
}

export function emitStatus(status: ConnectionStatus) {
  hub.emit('status', status)
}

export function emitLog(data: any) {
  hub.emit('log', data)
}

