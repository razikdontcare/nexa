import { tavily as createTavilyClient } from '@tavily/core'

export type TavilySearchParams = {
  apiKey: string
  query: string
  maxResults?: number
  searchDepth?: 'basic' | 'advanced'
}

export async function tavilySearch({ apiKey, query, maxResults = 5, searchDepth }: TavilySearchParams): Promise<string> {
  const safeMax = Math.max(1, Math.min(10, Number(maxResults || 5)))
  const client = createTavilyClient({ apiKey })

  // Use Tavily SDK instead of direct HTTP fetch
  let json: any
  try {
    json = await client.search(query, {
      maxResults: safeMax,
      // Ask Tavily to include a synthesized answer for convenience
      // SDK expects `includeAnswer` (string | boolean). Using 'advanced' for richer answers.
      includeAnswer: 'advanced' as any,
      // Pass through searchDepth when provided
      ...(searchDepth ? { searchDepth } : {}),
      // Keep images excluded to reduce payload, mirroring previous behavior
      includeImages: false,
    } as any)
  } catch (err: any) {
    throw new Error(`Tavily error: ${err?.message || String(err)}`)
  }

  const answer = (json?.answer || '').trim()
  const results = Array.isArray(json?.results) ? json.results : []
  const lines: string[] = []
  if (answer) {
    lines.push(`Answer: ${answer}`)
  }
  if (results.length) {
    lines.push('Sources:')
    for (const r of results.slice(0, safeMax)) {
      const title = (r?.title || '').toString().trim()
      const url = (r?.url || '').toString().trim()
      const content = (r?.content || '').toString().trim()
      const snippet = content ? content.slice(0, 300) : ''
      lines.push(`- ${title}${url ? ` (${url})` : ''}${snippet ? `\n  ${snippet}` : ''}`)
    }
  }
  return lines.join('\n') || 'No results.'
}
