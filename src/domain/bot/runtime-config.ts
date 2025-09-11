type RuntimeConfig = {
  prefix: string
  ownerJid: string
}

const state: RuntimeConfig = {
  prefix: '!',
  ownerJid: ''
}

export function setRuntimeConfig(patch: Partial<RuntimeConfig>) {
  if (typeof patch.prefix === 'string') state.prefix = patch.prefix
  if (typeof patch.ownerJid === 'string') state.ownerJid = patch.ownerJid
}

export function getRuntimeConfig(): RuntimeConfig {
  return { ...state }
}

export function getPrefix(): string {
  return state.prefix
}

export function getOwnerJid(): string {
  return state.ownerJid
}
