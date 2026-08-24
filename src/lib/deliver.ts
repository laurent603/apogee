import { renderReportEmail } from './email'

export type DeliveryResult = { channel: 'email' | 'notion'; ok: boolean; detail?: string }

/**
 * Sends a finished report to the channels an agent declares.
 *
 * Failures are returned rather than swallowed: a silently skipped send is
 * indistinguishable from a delivered one, which is how a missing API key went
 * unnoticed.
 */
export async function deliverReport(
  content: string,
  title: string,
  deliveryChannels: string,
  accountName?: string,
  /** Account-wide address from Brand Settings, applied when enabled there. */
  defaultEmail?: string | null,
): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = []

  let config: Record<string, unknown> = {}
  try { config = JSON.parse(deliveryChannels) } catch { config = { channels: ['in_app'] } }
  const channels: string[] = (config.channels as string[]) || ['in_app']

  // The account default is what makes template-created agents deliverable:
  // they store the bare string 'in_app' and carry no address of their own
  const wantsEmail = channels.includes('email') || Boolean(defaultEmail)

  if (wantsEmail) {
    const to = (config.email as string | undefined) || defaultEmail || undefined
    if (!to) {
      results.push({ channel: 'email', ok: false, detail: 'Aucune adresse renseignée sur l\'agent ni sur le compte' })
    } else if (!process.env.RESEND_API_KEY) {
      results.push({ channel: 'email', ok: false, detail: 'RESEND_API_KEY absente de l\'environnement' })
    } else {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || 'Apogee <onboarding@resend.dev>',
            to: [to],
            subject: title,
            html: renderReportEmail({ title, accountName, content }),
            text: content,
          }),
        })
        if (res.ok) {
          results.push({ channel: 'email', ok: true, detail: to })
        } else {
          const body = await res.text()
          results.push({ channel: 'email', ok: false, detail: `Resend ${res.status} — ${body.slice(0, 200)}` })
        }
      } catch (e) {
        results.push({ channel: 'email', ok: false, detail: e instanceof Error ? e.message.slice(0, 200) : 'inconnue' })
      }
    }
  }

  if (channels.includes('notion')) {
    const token = config.notionToken as string | undefined
    const pageId = config.notionPageId as string | undefined
    if (!token || !pageId) {
      results.push({ channel: 'notion', ok: false, detail: 'Token ou page Notion manquant sur l\'agent' })
    } else {
      try {
        const res = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
          },
          body: JSON.stringify({
            parent: { page_id: pageId },
            properties: { title: { title: [{ text: { content: title } }] } },
            // Notion caps a rich_text item at 2000 characters, so a long report
            // has to arrive as several blocks rather than one truncated one
            children: chunk(content, 1900).map((part) => ({
              object: 'block',
              type: 'paragraph',
              paragraph: { rich_text: [{ text: { content: part } }] },
            })),
          }),
        })
        if (res.ok) {
          results.push({ channel: 'notion', ok: true })
        } else {
          const body = await res.text()
          results.push({ channel: 'notion', ok: false, detail: `Notion ${res.status} — ${body.slice(0, 200)}` })
        }
      } catch (e) {
        results.push({ channel: 'notion', ok: false, detail: e instanceof Error ? e.message.slice(0, 200) : 'inconnue' })
      }
    }
  }

  for (const r of results) {
    if (!r.ok) console.error(`[deliver] ${r.channel} échec : ${r.detail}`)
  }
  return results
}

function chunk(s: string, size: number): string[] {
  const parts: string[] = []
  for (let i = 0; i < s.length; i += size) parts.push(s.slice(i, i + size))
  return parts.length ? parts.slice(0, 90) : ['(vide)']
}
