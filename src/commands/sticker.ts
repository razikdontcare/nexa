import type { CommandModule } from '../application/commands/Command.js'
import type { proto } from '@whiskeysockets/baileys'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import os from 'node:os'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

function findMedia(msg: proto.IWebMessageInfo): proto.IMessage | undefined {
  const m = msg.message
  if (!m) return undefined
  if (m.imageMessage || m.videoMessage || m.stickerMessage || m.documentMessage) return m as proto.IMessage
  const quoted = (m.extendedTextMessage?.contextInfo?.quotedMessage) as proto.IMessage | undefined
  if (quoted) return quoted
  return undefined
}

function isVideoMessage(m: proto.IMessage): boolean {
  return !!m.videoMessage
}

async function convertToWebp(inputBuf: Buffer, animated: boolean): Promise<Buffer> {
  // Use ffmpeg to convert to (animated) webp
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sticker-'))
  const inPath = path.join(tmpDir, 'in')
  const outPath = path.join(tmpDir, 'out.webp')
  await fs.writeFile(inPath, inputBuf)
  // Force a 512x512 canvas with transparent padding.
  // We scale the media to fit within 512x512 preserving aspect ratio, then pad to center.
  // For animated inputs: also cap duration and fps to keep size small.
  const scalePad = 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000@0';
  const args = animated
    ? [
        '-y',
        '-i', inPath,
        // cap duration to 6s, scale/pad and limit fps to keep size reasonable
        '-t', '6',
        '-vf', `${scalePad},fps=15`,
        '-an',
        '-vcodec', 'libwebp',
        '-loop', '0',
        '-preset', 'default',
        '-q:v', '60',
        outPath,
      ]
    : [
        '-y',
        '-i', inPath,
        '-vf', scalePad,
        '-frames:v', '1',
        '-f', 'webp', outPath,
      ]
  await new Promise<void>((resolve, reject) => {
    const p = spawn('ffmpeg', args)
    let err = ''
    p.stderr.on('data', d => { err += d.toString() })
    p.on('error', reject)
    p.on('close', code => code === 0 ? resolve() : reject(new Error(err || `ffmpeg exited ${code}`)))
  })
  const out = await fs.readFile(outPath)
  // cleanup
  fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  return out
}

function buildExif(pack: string, author: string, emojis: string[] = []): Buffer {
  const json = JSON.stringify({
    'sticker-pack-id': `${Date.now()}`,
    'sticker-pack-name': pack,
    'sticker-pack-publisher': author,
    'emojis': emojis,
  })
  const jsonBuf = Buffer.from(json, 'utf8')
  const header = Buffer.from('Exif\x00\x00', 'ascii')
  const tiff = Buffer.alloc(8) // TIFF header: II * 0x2A, offset 8
  tiff.write('II')
  tiff.writeUInt16LE(0x2A, 2)
  tiff.writeUInt32LE(8, 4)
  // IFD with one entry (UserComment tag 0x9286, type 7, count = 8 + jsonLen)
  const ifdCount = Buffer.alloc(2)
  ifdCount.writeUInt16LE(1)
  const entry = Buffer.alloc(12)
  entry.writeUInt16LE(0x9286, 0) // tag
  entry.writeUInt16LE(7, 2) // type UNDEFINED
  const count = 8 + jsonBuf.length
  entry.writeUInt32LE(count, 4)
  const valueOffset = 8 + 2 + 12 + 4 // tiff(8) + ifdCount(2) + entry(12) + nextIFDOffset(4)
  entry.writeUInt32LE(valueOffset, 8)
  const nextIfd = Buffer.alloc(4)
  nextIfd.writeUInt32LE(0)
  const ucomPrefix = Buffer.from('ASCII\x00\x00\x00', 'ascii')
  const payload = Buffer.concat([ucomPrefix, jsonBuf])
  const exifBody = Buffer.concat([tiff, ifdCount, entry, nextIfd, payload])
  return Buffer.concat([header, exifBody])
}

async function injectExifWithWebpmux(webp: Buffer, exif: Buffer): Promise<Buffer> {
  // Try to use webpmux if available
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sticker-exif-'))
  const inPath = path.join(tmpDir, 'in.webp')
  const outPath = path.join(tmpDir, 'out.webp')
  const exifPath = path.join(tmpDir, 'exif.bin')
  await fs.writeFile(inPath, webp)
  await fs.writeFile(exifPath, exif)
  await new Promise<void>((resolve, reject) => {
    const p = spawn('webpmux', ['-set', 'exif', exifPath, inPath, '-o', outPath])
    let err = ''
    p.stderr.on('data', d => { err += d.toString() })
    p.on('error', reject)
    p.on('close', code => code === 0 ? resolve() : reject(new Error(err || `webpmux exited ${code}`)))
  })
  const out = await fs.readFile(outPath)
  fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  return out
}

const command: CommandModule = {
  name: 'sticker',
  aliases: ['s', 'stik'],
  summary: 'Convert an image/video (or replied media) to a sticker',
  usage: '{prefix}sticker  (reply to an image/video or send with caption)',
  examples: ['{prefix}sticker'],
  cooldownMs: 5000,
  run: async ({ sock, from, reply, message, chatPrefix }) => {
    try {
      const target = findMedia(message)
      if (!target) {
        await reply({ text: `Send an image/video with caption {prefix}sticker or reply {prefix}sticker to media.`.replace(/\{prefix\}/g, chatPrefix) })
        return
      }
      // Download media buffer
      const buf = await downloadMediaMessage({ key: message.key, message: target } as any, 'buffer', {})
      const animated = isVideoMessage(target)
      let webp = await convertToWebp(buf as Buffer, animated)
      // embed pack/author using webpmux if available
      try {
        const pack = process.env.STICKER_PACK_NAME || 'Nexa Pack'
        const author = process.env.STICKER_PACK_AUTHOR || 'Nexa'
        const exif = buildExif(pack, author)
        webp = await injectExifWithWebpmux(webp, exif)
      } catch {
        // silently fall back without metadata
      }
      await sock.sendMessage(from, { sticker: webp }, { quoted: message })
    } catch (e: any) {
      await reply({ text: 'Failed to create sticker. Ensure ffmpeg is installed and accessible in PATH, and try a shorter/lower-resolution video.' })
    }
  }
}

export default command
