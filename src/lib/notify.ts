/**
 * Journal des incidents + alerte mail.
 *
 * Trois règles portent ce module :
 *
 * 1. Écrire un incident ne doit JAMAIS faire échouer l'opération qui l'a
 *    produit. Un lancement Meta réussi ne doit pas être signalé en échec
 *    parce que la base de log a hoqueté. Tout est encapsulé.
 * 2. Rien ne sort d'ici sans passer par redact(). Les erreurs Meta renvoient
 *    la requête complète, `access_token=EAA…` inclus, et un mail échappe à
 *    notre contrôle une fois parti.
 * 3. Le mail est dédupliqué sur 24 h par empreinte. Un agent cassé pendant
 *    une semaine produit sept incidents mais un seul mail.
 */

import { prisma } from './db'
import { markdownToEmailHtml } from './email'

export type NotifySource = 'launch' | 'agent_cron' | 'agent_chat' | 'comments' | 'delivery' | 'enrichment'

const MAIL_TO = process.env.ALERT_EMAIL || 'laurent@leadscore.fr'
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000

/* ─── Rédaction des secrets ─────────────────────────────────────────────── */

/**
 * Chaque motif remplace le secret, jamais toute la ligne : le reste du message
 * porte l'information utile au diagnostic.
 */
const SECRETS: [RegExp, string][] = [
  // Les motifs porteurs de contexte passent en premier : sinon le motif nu
  // `EAA…` ampute la valeur et le second remplacement laisse un résidu.
  [/(access_token=)[^&\s"'|)]+/gi, '$1[masqué]'],
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[masqué]'],
  [/\bEAA[A-Za-z0-9_-]{10,}/g, 'EAA…[token Facebook masqué]'],
  [/\bsecret_[A-Za-z0-9]{8,}/g, 'secret_[masqué]'],
  [/\bntn_[A-Za-z0-9]{8,}/g, 'ntn_[masqué]'],
  [/\bpit-[A-Za-z0-9-]{8,}/g, 'pit-[masqué]'],
  [/\bsk-ant-[A-Za-z0-9_-]{8,}/g, 'sk-ant-[masqué]'],
  [/\bre_[A-Za-z0-9_]{8,}/g, 're_[masqué]'],
  [/(postgres(?:ql)?:\/\/[^:]+:)[^@]+@/gi, '$1[masqué]@'],
  [/("?(?:token|apiKey|api_key|password|client_secret)"?\s*[:=]\s*"?)[^\s",}]{6,}/gi, '$1[masqué]'],
]

export function redact(input: string): string {
  let out = input
  for (const [re, to] of SECRETS) out = out.replace(re, to)
  return out
}

/* ─── Empreinte ─────────────────────────────────────────────────────────── */

/** Neutralise ce qui varie d'une occurrence à l'autre pour que la même panne
 *  se regroupe : identifiants, nombres, dates, UUID. */
function fingerprintOf(source: string, adAccountId: string | undefined, message: string): string {
  const normalised = message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '#')
    .replace(/\b(act_)?\d{6,}\b/g, '#')
    .replace(/\d+/g, '#')
    .slice(0, 180)
  return `${source}|${adAccountId || '-'}|${normalised}`
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try { return JSON.stringify(e) } catch { return 'erreur inconnue' }
}

/* ─── Écriture ──────────────────────────────────────────────────────────── */

export type NotifyInput = {
  source: NotifySource
  title: string
  error: unknown
  cause?: string
  context?: string
  adAccountId?: string
  accountName?: string
  agentName?: string
  /** false pour les incidents que l'utilisateur voit déjà à l'écran. */
  email?: boolean
  level?: 'error' | 'warning'
}

/**
 * Enregistre un incident et, si demandé, envoie l'alerte.
 * Ne lève jamais : renvoie l'id créé, ou null si le log lui-même a échoué.
 */
export async function notifyIncident(input: NotifyInput): Promise<string | null> {
  try {
    const level = input.level || 'error'
    const message = redact(messageOf(input.error)).slice(0, 1500)
    const context = input.context ? redact(input.context).slice(0, 4000) : null
    const cause = input.cause ? redact(input.cause).slice(0, 500) : null
    const fingerprint = fingerprintOf(input.source, input.adAccountId, message)

    const since = new Date(Date.now() - DEDUP_WINDOW_MS)
    const existing = await prisma.errorLog.findFirst({
      where: { fingerprint, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    })

    let row
    if (existing) {
      row = await prisma.errorLog.update({
        where: { id: existing.id },
        data: { occurrences: { increment: 1 }, lastSeenAt: new Date(), isRead: false, message, context, cause },
      })
    } else {
      row = await prisma.errorLog.create({
        data: {
          level, source: input.source, title: input.title.slice(0, 200),
          message, cause, context,
          adAccountId: input.adAccountId, accountName: input.accountName,
          agentName: input.agentName, fingerprint,
        },
      })
    }

    // Un warning ne réveille personne ; une erreur, une fois par 24 h et par cause.
    const alreadyMailed = row.mailedAt && Date.now() - row.mailedAt.getTime() < DEDUP_WINDOW_MS
    if (input.email && level === 'error' && !alreadyMailed) {
      const sent = await sendAlertEmail({
        subject: `⚠ ${input.title}${input.accountName ? ` — ${input.accountName}` : ''}`,
        headline: input.title,
        accent: '#dc2626',
        accountName: input.accountName,
        body: buildIncidentBody({ ...input, message, cause, context, occurrences: row.occurrences }),
      })
      if (sent) await prisma.errorLog.update({ where: { id: row.id }, data: { mailedAt: new Date() } })
    }

    return row.id
  } catch (e) {
    // Dernier recours : les Runtime Logs Vercel.
    console.error('[notify] impossible d\'enregistrer l\'incident :', e instanceof Error ? e.message : e)
    return null
  }
}

function buildIncidentBody(o: {
  source: NotifySource; message: string; cause?: string | null
  context?: string | null; agentName?: string; occurrences: number
}): string {
  const label: Record<NotifySource, string> = {
    launch: 'Lancement de campagne', agent_cron: 'Agent automatique',
    agent_chat: 'Analyse interactive', comments: 'Analyse des commentaires',
    delivery: 'Livraison du rapport', enrichment: 'Enrichissement des données',
  }
  const parts = [
    `**Origine :** ${label[o.source]}`,
    o.agentName ? `**Agent :** ${o.agentName}` : '',
    o.occurrences > 1 ? `**Occurrences :** ${o.occurrences} fois en 24 h` : '',
    '',
    o.cause ? `## Cause probable\n\n${o.cause}\n` : '',
    '## Message d\'erreur',
    '',
    '```',
    o.message,
    '```',
    o.context ? `\n## Contexte\n\n\`\`\`\n${o.context}\n\`\`\`` : '',
    '',
    '---',
    '',
    'Cet incident est aussi consultable dans l\'onglet **Notifications** de l\'application.',
  ]
  return parts.filter((p) => p !== '').join('\n')
}

/* ─── Confirmation de lancement ─────────────────────────────────────────── */

/** Accusé de réception d'un lancement réussi, journal inclus. */
export async function notifyLaunchSuccess(o: {
  campaignName: string; accountName?: string
  adsetCount: number; adCount: number; journal: string
}): Promise<void> {
  const journal = redact(o.journal)
  // Un journal de lancement peut faire des centaines de lignes ; l'essentiel
  // tient dans la fin, là où se trouvent les créations effectives.
  const lines = journal.split('\n').filter((l) => l.trim())
  const shown = lines.length > 60 ? ['…', ...lines.slice(-60)] : lines

  await sendAlertEmail({
    subject: `✓ Lancement réussi — ${o.campaignName}`,
    headline: 'Lancement réussi',
    accent: '#059669',
    accountName: o.accountName,
    body: [
      `**Campagne :** ${o.campaignName}`,
      `**Créé :** ${o.adsetCount} ensemble${o.adsetCount > 1 ? 's' : ''} de publicités · ${o.adCount} publicité${o.adCount > 1 ? 's' : ''}`,
      '',
      '## Journal',
      '',
      '```',
      shown.join('\n'),
      '```',
      lines.length > 60 ? `\n*(${lines.length - 60} lignes précédentes omises — journal complet dans l'Historique)*` : '',
    ].filter((p) => p !== '').join('\n'),
  })
}

/* ─── Envoi ─────────────────────────────────────────────────────────────── */

async function sendAlertEmail(o: {
  subject: string; headline: string; accent: string
  accountName?: string; body: string
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.error('[notify] RESEND_API_KEY absente — alerte non envoyée :', o.subject)
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Leadscore <onboarding@resend.dev>',
        to: [MAIL_TO],
        subject: o.subject,
        html: renderAlertEmail(o),
        text: o.body,
      }),
    })
    if (!res.ok) {
      console.error(`[notify] Resend ${res.status} — ${(await res.text()).slice(0, 200)}`)
      return false
    }
    return true
  } catch (e) {
    console.error('[notify] envoi impossible :', e instanceof Error ? e.message : e)
    return false
  }
}

/** Exportée pour pouvoir relire le rendu sans envoyer de mail. */
export function renderAlertEmail(o: { headline: string; accent: string; accountName?: string; body: string }): string {
  const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const sub = [o.accountName, new Date().toLocaleString('fr-FR', {
    day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
  })].filter(Boolean).join(' · ')

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.headline)}</title></head>
<body style="margin:0;padding:0;background:#f5f6fa">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.headline)} — ${esc(sub)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f6fa;padding:28px 12px">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
      <tr><td style="background:${o.accent};padding:18px 26px">
        <div style="font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff">${esc(o.headline)}</div>
        <div style="font-family:${FONT};font-size:12px;color:rgba(255,255,255,.8);margin-top:3px">${esc(sub)}</div>
      </td></tr>
      <tr><td style="padding:26px;font-family:${FONT}">${markdownToEmailHtml(o.body)}</td></tr>
      <tr><td style="padding:16px 26px;border-top:1px solid #e5e7eb;background:#f8f9fc;font-family:${FONT};font-size:11px;color:#6b7280">
        Alerte automatique Leadscore. Les identifiants et jetons d'accès sont masqués avant envoi.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}
