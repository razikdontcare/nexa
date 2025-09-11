/* In-memory runtime metrics for monitoring */

export type BotStatus = 'open' | 'close' | 'connecting' | 'unknown'

type Activity = {
  t: number
  kind: 'recv' | 'send' | 'cmd' | 'error' | 'status'
  from?: string
  to?: string
  summary: string
}

const startedAt = Date.now()
let status: BotStatus = 'unknown'
let version: string | undefined
let me: string | undefined

const counters = {
  recv: 0,
  sent: 0,
  cmds: 0,
  cmdErrors: 0,
}

const recent: Activity[] = []
const MAX_ACTIVITIES = 50

function pushActivity(act: Activity) {
  recent.push(act)
  if (recent.length > MAX_ACTIVITIES) recent.shift()
}

export function setStatus(s: BotStatus) {
  status = s
  pushActivity({ t: Date.now(), kind: 'status', summary: `status=${s}` })
}

export function setVersion(v: string) { version = v }
export function setMe(jid?: string) { me = jid }

export function recordRecv(from: string, summary: string) {
  counters.recv += 1
  pushActivity({ t: Date.now(), kind: 'recv', from, summary })
}

export function recordSend(to: string, summary: string) {
  counters.sent += 1
  pushActivity({ t: Date.now(), kind: 'send', to, summary })
}

export function recordCmd(name: string, from: string) {
  counters.cmds += 1
  pushActivity({ t: Date.now(), kind: 'cmd', from, summary: name })
}

export function recordCmdError(name: string, from: string) {
  counters.cmdErrors += 1
  pushActivity({ t: Date.now(), kind: 'error', from, summary: `cmd:${name}` })
}

export function snapshot() {
  const mu = process.memoryUsage()
  return {
    startedAt,
    now: Date.now(),
    uptimeMs: Date.now() - startedAt,
    status,
    version,
    me,
    memory: {
      rss: mu.rss,
      heapTotal: mu.heapTotal,
      heapUsed: mu.heapUsed,
      external: mu.external,
    },
    counters: { ...counters },
    recent: [...recent].reverse(),
  }
}

