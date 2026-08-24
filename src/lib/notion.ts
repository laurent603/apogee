/**
 * Pulls reference ad copy out of a Notion workspace.
 *
 * The source is either a database (rows with properties like funnel stage and
 * awareness level) or a page holding sub-pages — accounts have both, so the
 * fetcher probes for a database first and falls back to page children.
 *
 * Called only from an explicit sync, never per analysis: a hundred pages is a
 * hundred-plus calls against a ~3 req/s limit.
 */

const API = 'https://api.notion.com/v1'
const VERSION = '2022-06-28'

export type KnowledgeItem = {
  titre: string
  proprietes: Record<string, string>
  contenu: string
}

async function notion(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Notion ${res.status} — ${body.slice(0, 220)}`)
  }
  return res.json()
}

/** Notion ids appear dashed or bare, and are often pasted inside a full URL. */
export function normaliseNotionId(raw: string): string {
  const cleaned = (raw || '').trim()
  const fromUrl = cleaned.match(/([0-9a-f]{32})(?:\?|$|#)/i) || cleaned.match(/([0-9a-f-]{36})(?:\?|$|#)/i)
  const id = (fromUrl ? fromUrl[1] : cleaned).replace(/-/g, '')
  if (id.length !== 32) return cleaned
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`
}

function plain(rich: unknown): string {
  return Array.isArray(rich)
    ? (rich as { plain_text?: string }[]).map(r => r?.plain_text || '').join('').trim()
    : ''
}

/** Flattens a Notion property to a readable string, whatever its type. */
function propertyValue(prop: Record<string, unknown>): string {
  switch (prop?.type as string) {
    case 'title': return plain(prop.title)
    case 'rich_text': return plain(prop.rich_text)
    case 'select': return (prop.select as { name?: string })?.name || ''
    case 'multi_select': return ((prop.multi_select as { name: string }[]) || []).map(o => o.name).join(', ')
    case 'status': return (prop.status as { name?: string })?.name || ''
    case 'number': return prop.number != null ? String(prop.number) : ''
    case 'checkbox': return prop.checkbox ? 'oui' : 'non'
    case 'url': return (prop.url as string) || ''
    case 'date': return (prop.date as { start?: string })?.start || ''
    case 'people': return ((prop.people as { name?: string }[]) || []).map(p => p.name || '').filter(Boolean).join(', ')
    case 'formula': return String((prop.formula as { string?: string; number?: number })?.string ?? (prop.formula as { number?: number })?.number ?? '')
    default: return ''
  }
}

/** Reads a page's body, following one level of nesting. */
async function pageText(pageId: string, token: string, depth = 0): Promise<string> {
  const out: string[] = []
  let cursor: string | undefined
  do {
    const q = new URLSearchParams({ page_size: '100' })
    if (cursor) q.set('start_cursor', cursor)
    const res = await notion(`/blocks/${pageId}/children?${q}`, token)
    for (const b of (res.results || []) as Record<string, unknown>[]) {
      const type = b.type as string
      const data = b[type] as Record<string, unknown> | undefined
      const text = plain(data?.rich_text)
      if (text) {
        if (type === 'heading_1') out.push(`# ${text}`)
        else if (type === 'heading_2') out.push(`## ${text}`)
        else if (type === 'heading_3') out.push(`### ${text}`)
        else if (type === 'bulleted_list_item' || type === 'numbered_list_item') out.push(`- ${text}`)
        else if (type === 'quote') out.push(`> ${text}`)
        else out.push(text)
      }
      if (b.has_children && depth < 1 && type !== 'child_page') {
        const nested = await pageText(b.id as string, token, depth + 1)
        if (nested) out.push(nested)
      }
    }
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  return out.join('\n').trim()
}

const MAX_ITEMS = 150
const MAX_CHARS_PER_ITEM = 4000

/**
 * Fetches every entry under `sourceId`, whether it is a database or a page.
 * Returns the normalised items plus a note on what the source turned out to be.
 */
export async function fetchNotionKnowledge(
  sourceId: string,
  token: string,
): Promise<{ items: KnowledgeItem[]; kind: 'database' | 'page' }> {
  const id = normaliseNotionId(sourceId)

  // Databases and pages are separate endpoints; probing avoids asking the user
  // which one they pasted
  let kind: 'database' | 'page' = 'page'
  try {
    await notion(`/databases/${id}`, token)
    kind = 'database'
  } catch {
    kind = 'page'
  }

  const items: KnowledgeItem[] = []

  if (kind === 'database') {
    let cursor: string | undefined
    do {
      const res = await notion(`/databases/${id}/query`, token, {
        method: 'POST',
        body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
      })
      for (const page of (res.results || []) as Record<string, unknown>[]) {
        if (items.length >= MAX_ITEMS) break
        const props = (page.properties || {}) as Record<string, Record<string, unknown>>
        const proprietes: Record<string, string> = {}
        let titre = ''
        for (const [key, prop] of Object.entries(props)) {
          const value = propertyValue(prop)
          if (!value) continue
          if (prop.type === 'title') titre = value
          else proprietes[key] = value
        }
        const contenu = await pageText(page.id as string, token).catch(() => '')
        if (titre || contenu || Object.keys(proprietes).length) {
          items.push({ titre: titre || '(sans titre)', proprietes, contenu: contenu.slice(0, MAX_CHARS_PER_ITEM) })
        }
      }
      cursor = res.has_more && items.length < MAX_ITEMS ? res.next_cursor : undefined
    } while (cursor)
    return { items, kind }
  }

  // A page: take its own body, then each sub-page
  const own = await pageText(id, token).catch(() => '')
  if (own) items.push({ titre: '(page racine)', proprietes: {}, contenu: own.slice(0, MAX_CHARS_PER_ITEM) })

  let cursor: string | undefined
  do {
    const q = new URLSearchParams({ page_size: '100' })
    if (cursor) q.set('start_cursor', cursor)
    const res = await notion(`/blocks/${id}/children?${q}`, token)
    for (const b of (res.results || []) as Record<string, unknown>[]) {
      if (items.length >= MAX_ITEMS) break
      if (b.type !== 'child_page' && b.type !== 'child_database') continue
      if (b.type === 'child_database') {
        const nested = await fetchNotionKnowledge(b.id as string, token).catch(() => ({ items: [] as KnowledgeItem[] }))
        items.push(...nested.items.slice(0, MAX_ITEMS - items.length))
        continue
      }
      const titre = ((b.child_page as { title?: string })?.title) || '(sans titre)'
      const contenu = await pageText(b.id as string, token).catch(() => '')
      if (contenu) items.push({ titre, proprietes: {}, contenu: contenu.slice(0, MAX_CHARS_PER_ITEM) })
    }
    cursor = res.has_more && items.length < MAX_ITEMS ? res.next_cursor : undefined
  } while (cursor)

  return { items, kind }
}

/** Renders the stored items for injection into a creative prompt. */
export function renderKnowledgeForPrompt(json: string | null | undefined, budget = 60000): string | null {
  if (!json) return null
  let items: KnowledgeItem[]
  try { items = JSON.parse(json) } catch { return null }
  if (!Array.isArray(items) || items.length === 0) return null

  const parts: string[] = []
  let used = 0
  for (const it of items) {
    const props = Object.entries(it.proprietes || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')
    const block = `### ${it.titre}${props ? `\n_${props}_` : ''}\n${it.contenu || ''}`.trim()
    if (used + block.length > budget) break
    parts.push(block)
    used += block.length
  }
  if (!parts.length) return null
  return parts.join('\n\n')
}
