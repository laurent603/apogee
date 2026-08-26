/**
 * Markdown → email HTML.
 *
 * Reports are written in Markdown; mail clients render none of it. Sending
 * `content.replace(/\n/g, '<br>')` shipped literal `|---|---|` and `##` to the
 * inbox. Styles must be inline — Gmail strips <style> blocks, and no client
 * gives us flexbox or CSS variables.
 */

const C = {
  text: '#0d0d12',
  muted: '#6b7280',
  border: '#e5e7eb',
  rule: '#f0f0f3',
  head: '#f8f9fc',
  brand: '#3434ef',
  page: '#f5f6fa',
}

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline(text: string): string {
  return esc(text)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" style="color:${C.brand};text-decoration:underline">$1</a>`)
    .replace(/\*\*(.+?)\*\*/g, `<strong style="font-weight:600;color:${C.text}">$1</strong>`)
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, `<code style="background:${C.head};border:1px solid ${C.border};border-radius:4px;padding:1px 5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px">$1</code>`)
}

function isTableRow(line: string) { return /^\s*\|.*\|\s*$/.test(line) }
function isTableSep(line: string) { return /^\s*\|[\s:|-]+\|\s*$/.test(line) }
function cells(line: string) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
}

export function markdownToEmailHtml(md: string): string {
  const lines = (md || '').split('\n')
  const out: string[] = []
  let i = 0
  let listOpen: 'ul' | 'ol' | null = null
  let para: string[] = []

  const flushPara = () => {
    if (!para.length) return
    out.push(`<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:${C.text}">${para.join('<br>')}</p>`)
    para = []
  }
  const closeList = () => {
    if (listOpen) { out.push(`</${listOpen}>`); listOpen = null }
  }

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block. Must be tested before everything else: its content is
    // verbatim, and a stack trace full of `*` or `|` would otherwise be parsed
    // as emphasis or as a table. Alert emails lean on this for error messages.
    const fence = line.match(/^\s*```/)
    if (fence) {
      flushPara(); closeList()
      i++
      const code: string[] = []
      while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i]); i++ }
      i++ // closing fence, or end of input
      out.push(
        `<pre style="margin:0 0 16px;padding:12px 14px;background:${C.head};border:1px solid ${C.border};border-radius:8px;overflow-x:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.55;color:${C.text};white-space:pre-wrap;word-break:break-word">${esc(code.join('\n'))}</pre>`
      )
      continue
    }

    // Table: header row, separator, then body rows
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushPara(); closeList()
      const head = cells(line)
      i += 2
      const body: string[][] = []
      while (i < lines.length && isTableRow(lines[i])) { body.push(cells(lines[i])); i++ }

      const th = head
        .map((h) => `<th style="text-align:left;padding:9px 11px;background:${C.head};border-bottom:2px solid ${C.border};font-size:12px;font-weight:600;color:${C.text};white-space:nowrap">${inline(h)}</th>`)
        .join('')
      const tr = body
        .map((row) => `<tr>${row.map((c) => `<td style="padding:9px 11px;border-bottom:1px solid ${C.rule};font-size:13px;color:${C.text};vertical-align:top">${inline(c)}</td>`).join('')}</tr>`)
        .join('')
      out.push(
        `<div style="overflow-x:auto;margin:0 0 18px"><table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;border:1px solid ${C.border};border-radius:8px"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`
      )
      continue
    }

    const h = line.match(/^(#{1,4})\s+(.+)/)
    if (h) {
      flushPara(); closeList()
      const size = [21, 17, 15, 14][h[1].length - 1]
      const top = out.length === 0 ? 0 : 26
      const rule = h[1].length <= 2 ? `border-bottom:1px solid ${C.border};padding-bottom:7px;` : ''
      out.push(`<h${h[1].length} style="margin:${top}px 0 12px;font-size:${size}px;font-weight:600;color:${C.text};${rule}">${inline(h[2])}</h${h[1].length}>`)
      i++; continue
    }

    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushPara(); closeList()
      out.push(`<hr style="border:none;border-top:1px solid ${C.border};margin:22px 0">`)
      i++; continue
    }

    const bq = line.match(/^>\s?(.*)/)
    if (bq) {
      flushPara(); closeList()
      const quoted: string[] = [bq[1]]
      i++
      while (i < lines.length && /^>\s?/.test(lines[i])) { quoted.push(lines[i].replace(/^>\s?/, '')); i++ }
      out.push(`<div style="border-left:3px solid ${C.brand};background:${C.head};padding:12px 14px;margin:0 0 16px;border-radius:0 6px 6px 0;font-size:13px;line-height:1.6;color:${C.text}">${quoted.map(inline).join('<br>')}</div>`)
      continue
    }

    const ul = line.match(/^\s*[-*+]\s+(.+)/)
    const ol = line.match(/^\s*\d+[.)]\s+(.+)/)
    if (ul || ol) {
      flushPara()
      const want = ul ? 'ul' : 'ol'
      if (listOpen !== want) {
        closeList()
        out.push(`<${want} style="margin:0 0 16px;padding-left:22px;font-size:14px;line-height:1.65;color:${C.text}">`)
        listOpen = want
      }
      out.push(`<li style="margin:0 0 5px">${inline((ul || ol)![1])}</li>`)
      i++; continue
    }

    if (!line.trim()) { flushPara(); closeList(); i++; continue }

    closeList()
    para.push(inline(line.trim()))
    i++
  }
  flushPara(); closeList()
  return out.join('')
}

/** Full email document: preheader, header band, report body, footer. */
export function renderReportEmail(opts: { title: string; accountName?: string; content: string }): string {
  const { title, accountName, content } = opts
  const body = markdownToEmailHtml(content)
  const sub = accountName ? `${esc(accountName)} · ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}` : new Date().toLocaleDateString('fr-FR')

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(title)} — ${sub}</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${C.page};padding:28px 12px">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid ${C.border};border-radius:14px;overflow:hidden">
      <tr><td style="background:${C.brand};padding:18px 26px">
        <div style="font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff">${esc(title)}</div>
        <div style="font-family:${FONT};font-size:12px;color:rgba(255,255,255,.75);margin-top:3px">${sub}</div>
      </td></tr>
      <tr><td style="padding:26px;font-family:${FONT}">${body}</td></tr>
      <tr><td style="padding:16px 26px;border-top:1px solid ${C.border};background:${C.head};font-family:${FONT};font-size:11px;color:${C.muted}">
        Rapport généré automatiquement par Leadscore à partir de vos données Meta Ads.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}
