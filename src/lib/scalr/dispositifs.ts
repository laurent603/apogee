import type { Feuille } from './feuilleTournage'

/**
 * Les dispositifs d'une créa statique.
 *
 * Le composeur savait poser trois blocs de texte sur une photo. Les briefs,
 * eux, conçoivent des publicités : pastille de contexte, comparatif deux
 * colonnes, liste à coches, bloc prix, bouton. Le tiers rendu contre les deux
 * tiers oubliés — et c'est le tiers qui ne vend rien.
 *
 * Chaque dispositif sait se mesurer et se dessiner. Le composeur les empile,
 * mesure l'ensemble, puis réduit l'échelle jusqu'à ce que tout tienne dans la
 * zone utile. Une créa dense n'est pas un accident : c'est un choix de
 * l'angle, et elle doit tenir sans qu'on rogne un dispositif au hasard.
 */

export type Dispositif =
  | { type: 'pastille'; texte: string }
  | { type: 'accroche'; texte: string }
  | { type: 'sous'; texte: string }
  | { type: 'comparatif'; gauche: string; droite: string; lignes: { label: string; g: string; d: string }[] }
  | { type: 'puces'; items: string[] }
  | { type: 'prix'; montant: string; mention?: string }
  | { type: 'bouton'; texte: string }
  | { type: 'mention'; texte: string }

export type Marque = {
  accent: string
  principale: string
  policeTitre: string
  policeTexte: string
  boutonFond: string
  boutonTexte: string
  boutonPilule: boolean
}

/**
 * Découpe une ligne de comparatif écrite en une seule chaîne.
 *
 * Le brief les rend sous la forme « Label — ✕ à gauche / ✓ à droite ». Un
 * format libre serait ingérable ; celui-ci se lit sans ambiguïté, et ce qui
 * ne s'y conforme pas devient un label seul plutôt que d'être perdu.
 */
export function ligneComparatif(brut: string): { label: string; g: string; d: string } {
  const s = String(brut ?? '')
  const [label, reste] = s.split(/\s+[—–-]\s+/, 2)
  if (!reste) return { label: s.trim(), g: '', d: '' }
  const [g, d] = reste.split(/\s+\/\s+/, 2)
  const nettoie = (v: string) => String(v ?? '').replace(/^[✓✔✕✖x×]\s*/u, '').trim()
  return { label: (label ?? '').trim(), g: nettoie(g), d: nettoie(d ?? '') }
}

/** Ce que la feuille contient, traduit en dispositifs, dans l'ordre de lecture. */
export function dispositifsDeLaFeuille(f: Feuille | null): Dispositif[] {
  if (!f) return []
  const t = (f.textes_incrustes ?? {}) as Record<string, unknown>
  const out: Dispositif[] = []
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')

  if (s(t.pastille_verbatim)) out.push({ type: 'pastille', texte: s(t.pastille_verbatim) })
  if (s(t.accroche)) out.push({ type: 'accroche', texte: s(t.accroche) })
  if (s(t.sous_accroche)) out.push({ type: 'sous', texte: s(t.sous_accroche) })
  if (s(t.prix)) out.push({ type: 'prix', montant: s(t.prix), mention: s(t.prix_mention) })

  const lignes = Array.isArray(t.comparatif_lignes) ? (t.comparatif_lignes as string[]) : []
  if (lignes.length) {
    out.push({
      type: 'comparatif',
      gauche: s(t.comparatif_titre_gauche) || 'Ailleurs',
      droite: s(t.comparatif_titre_droite) || 'Chez nous',
      lignes: lignes.map(ligneComparatif),
    })
  }

  if (f.bullets?.length) out.push({ type: 'puces', items: f.bullets.filter(Boolean) })
  if (s(f.cta?.ecran) || s(f.cta?.dit)) out.push({ type: 'bouton', texte: s(f.cta?.ecran) || s(f.cta?.dit) })
  if (s(t.mention)) out.push({ type: 'mention', texte: s(t.mention) })

  return out
}

/**
 * Les mots qui reçoivent l'accent.
 *
 * La règle des comptes est constante : l'accent marque le chiffre de la
 * promesse, jamais un mot de liaison. On repère donc les nombres, montants et
 * pourcentages — et l'utilisateur peut passer outre en nommant lui-même les
 * mots à colorer.
 */
/** Le repère du mode automatique : teinter tout ce qui est chiffré. */
export const ACCENT_AUTO = '\u0000auto'

export function motsAccentues(texte: string, choix?: string): Set<string> {
  const set = new Set<string>()
  if (choix?.trim()) {
    for (const m of choix.split(/[,;]/).map((x) => x.trim().toLowerCase()).filter(Boolean)) set.add(m)
    return set
  }
  // Un montant s'écrit « 22 000 € » : trois mots pour une seule idée. Chercher
  // la chaîne entière puis comparer mot à mot ne teintait que « 000 ». Le mode
  // automatique teinte donc tout ce qui est chiffré, unité comprise.
  void texte
  set.add(ACCENT_AUTO)
  return set
}

/** Ce mot porte-t-il un chiffre, un montant ou une unité ? */
export const estChiffre = (mot: string) =>
  /^[\d\s  .,]+$/.test(mot) || /^[€%]$/.test(mot) || /\d/.test(mot) || /^(?:€|%|kwc|kw)\.?$/i.test(mot)
