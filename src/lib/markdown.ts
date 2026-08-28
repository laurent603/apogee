/**
 * Markdown → HTML, pour les rapports affichés dans l'application.
 *
 * Vivait dans la page Autopilot, seule à en avoir eu besoin. L'historique et
 * le détail créa affichent les mêmes rapports : les laisser en texte brut
 * rendait des tableaux illisibles et des titres noyés dans les dièses.
 *
 * Le rendu couvre ce que les agents produisent réellement — titres, tableaux,
 * listes, gras, code, filets — puisque les prompts imposent désormais du
 * Markdown et interdisent le HTML.
 */

export function inlineMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/→/g, '→')
}

export function markdownToHtml(md: string): string {
  if (!md) return ''

  // Pre-process: code blocks (protect content)
  const codeBlocks: string[] = []
  let html = md.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(code)
    return `%%CODE${codeBlocks.length - 1}%%`
  })

  // Tables
  html = html.replace(
    /\|(.+)\|\s*\n\|[-| :]+\|\s*\n((?:\|.+\|[ \t]*\n?)+)/g,
    (_, header, body) => {
      const ths = header.split('|').map((s: string) => s.trim()).filter(Boolean)
      const rows = body.trim().split('\n').filter((r: string) => r.trim().startsWith('|'))
        .map((row: string) => row.split('|').map((s: string) => s.trim()).filter(Boolean))
      const thead = `<thead><tr>${ths.map((h: string) => `<th>${inlineMd(h)}</th>`).join('')}</tr></thead>`
      const tbody = `<tbody>${rows.map((r: string[]) => `<tr>${r.map((c: string) => `<td>${inlineMd(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
      return `<table>${thead}${tbody}</table>\n`
    }
  )

  // Process line by line
  const lines = html.split('\n')
  const out: string[] = []
  let inUl = false, inOl = false, paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) {
      const txt = paragraph.join('<br>')
      if (txt.trim()) out.push(`<p>${txt}</p>`)
      paragraph = []
    }
  }

  const closeList = () => {
    if (inUl) { out.push('</ul>'); inUl = false }
    if (inOl) { out.push('</ol>'); inOl = false }
  }

  for (const rawLine of lines) {
    const line = rawLine

    // Code block restore
    const codeMatch = line.match(/^%%CODE(\d+)%%$/)
    if (codeMatch) {
      flushParagraph(); closeList()
      out.push(`<pre><code>${codeBlocks[parseInt(codeMatch[1])]}</code></pre>`)
      continue
    }

    // Table rows (already converted)
    if (line.startsWith('<table>') || line.startsWith('<thead>') || line.startsWith('<tbody>')) {
      flushParagraph(); closeList()
      out.push(line)
      continue
    }

    // H1 / H2 / H3
    const h3 = line.match(/^###\s+(.+)/)
    if (h3) { flushParagraph(); closeList(); out.push(`<h3>${inlineMd(h3[1])}</h3>`); continue }
    const h2 = line.match(/^##\s+(.+)/)
    if (h2) { flushParagraph(); closeList(); out.push(`<h2>${inlineMd(h2[1])}</h2>`); continue }
    const h1 = line.match(/^#\s+(.+)/)
    if (h1) { flushParagraph(); closeList(); out.push(`<h1>${inlineMd(h1[1])}</h1>`); continue }

    // HR
    if (/^---+$/.test(line.trim())) {
      flushParagraph(); closeList(); out.push('<hr>'); continue
    }

    // Blockquote
    const bq = line.match(/^>\s*(.+)/)
    if (bq) { flushParagraph(); closeList(); out.push(`<blockquote>${inlineMd(bq[1])}</blockquote>`); continue }

    // UL
    const ul = line.match(/^[*\-]\s+(.+)/)
    if (ul) {
      flushParagraph()
      if (inOl) { out.push('</ol>'); inOl = false }
      if (!inUl) { out.push('<ul>'); inUl = true }
      out.push(`<li>${inlineMd(ul[1])}</li>`)
      continue
    }

    // OL
    const ol = line.match(/^\d+\.\s+(.+)/)
    if (ol) {
      flushParagraph()
      if (inUl) { out.push('</ul>'); inUl = false }
      if (!inOl) { out.push('<ol>'); inOl = true }
      out.push(`<li>${inlineMd(ol[1])}</li>`)
      continue
    }

    // Blank line = paragraph break
    if (line.trim() === '') {
      closeList()
      flushParagraph()
      continue
    }

    // Otherwise: accumulate paragraph
    if (inUl || inOl) { closeList() }
    paragraph.push(inlineMd(line))
  }

  flushParagraph()
  closeList()

  return out.join('\n')
}
