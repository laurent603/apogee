import { ImageResponse } from 'next/og'
import type { Police } from './polices'

/**
 * Les gabarits des créas hybrides : l'IA ne fournit que le visuel (photo,
 * scène, sans texte) ; titres, logo, couleurs et bouton sont posés ici en
 * HTML, dans les vraies polices du Brand kit, puis rendus en PNG par next/og.
 * Le texte est donc toujours net et juste, le logo toujours le vrai.
 *
 * Contraintes du moteur (satori) : flexbox seulement, tout div à plusieurs
 * enfants en display flex, des images aux dimensions explicites.
 * En 9:16, rien d'écrit dans les 20 % du haut et du bas : seulement le fond.
 */

export const GABARITS = ['photo', 'split', 'liste', 'typo', 'editorial', 'produit', 'comparatif'] as const
export type Gabarit = (typeof GABARITS)[number]

export type TextesCrea = {
  surtitre: string
  titre: string
  /** Les mots du titre à mettre en couleur d'accent. */
  accent: string
  sousTitre: string
  points: string[]
  offre: string
  bouton: string
  mention: string
  /** Avant / après, écran partagé : la légende de chaque moitié. */
  gauche: string
  droite: string
}

export type Palette = { principale: string; accent: string; fond: string; sombre: string }

export type Habillage = {
  gabarit: Gabarit
  /** Variante de présentation dans un gabarit : « numeros » (liste), « polaroid » (photo)… */
  style?: string
  textes: TextesCrea
  visuel: string | null
  logo: string | null
  logoClair: string | null
  nom: string
  palette: Palette
  polices: { titre: string; texte: string; fonts: Police[] }
}

const L = 1080

// ─── Couleurs ───────────────────────────────────────────────────────────────
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
export const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const melanger = (a: string, b: string, t: number) =>
  `#${rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
const surFond = (hex: string) => (luminance(hex) > 0.45 ? '#0d0d12' : '#ffffff')
const alpha = (hex: string, a: number) => `rgba(${rgb(hex).join(',')},${a})`

/** La palette des gabarits, tirée des couleurs et rôles du kit ; bleu Apogee s'il n'y a rien. */
export function palette(couleurs: string[], roles: string[]): Palette {
  const role = (r: string) => couleurs[roles.indexOf(r)]
  const principale = role('principale') ?? couleurs[0] ?? '#0076ff'
  const accent = role('accent') ?? role('secondaire') ?? couleurs[1] ?? principale
  const fond = role('fond') ?? melanger(principale, '#ffffff', 0.92)
  const foncees = couleurs.filter((c) => luminance(c) < 0.08).sort((a, b) => luminance(a) - luminance(b))
  const sombre = foncees[0] ?? melanger(principale, '#000000', 0.72)
  return { principale, accent: accent === principale && luminance(principale) < 0.08 ? melanger(principale, '#ffffff', 0.4) : accent, fond, sombre }
}

// ─── Briques ────────────────────────────────────────────────────────────────

/** Taille d'un titre selon sa longueur : le moteur ne réduit pas un texte trop long. */
const taille = (texte: string, grand: number, petit: number) => {
  const n = texte.length
  return Math.round(n <= 22 ? grand : n >= 80 ? petit : grand - ((grand - petit) * (n - 22)) / 58)
}

function Titre({ h, couleur, grand = 96, petit = 52, centre }: { h: Habillage; couleur: string; grand?: number; petit?: number; centre?: boolean }) {
  const { titre, accent } = h.textes
  const marques = new Set(accent.toLowerCase().split(/\s+/).filter(Boolean))
  const mots = titre.split(/\s+/).filter(Boolean)
  const fs = taille(titre, grand, petit)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: centre ? 'center' : 'flex-start', fontFamily: h.polices.titre, fontWeight: 800, fontSize: fs, lineHeight: 1.05, letterSpacing: -1, color: couleur }}>
      {mots.map((m, i) => (
        <span key={i} style={{ marginRight: fs * 0.24, color: marques.has(m.toLowerCase().replace(/[.,!?;:«»]/g, '')) || marques.has(m.toLowerCase()) ? h.palette.accent : couleur }}>{m}</span>
      ))}
    </div>
  )
}

function Texte({ h, children, couleur, taille: fs = 34, poids = 400, centre }: { h: Habillage; children: string; couleur: string; taille?: number; poids?: 400 | 600; centre?: boolean }) {
  if (!children) return null
  return <div style={{ display: 'flex', fontFamily: h.polices.texte, fontWeight: poids, fontSize: fs, lineHeight: 1.3, color: couleur, textAlign: centre ? 'center' : 'left', justifyContent: centre ? 'center' : 'flex-start' }}>{children}</div>
}

function Surtitre({ h, couleur }: { h: Habillage; couleur: string }) {
  if (!h.textes.surtitre) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', fontFamily: h.polices.texte, fontWeight: 600, fontSize: 24, letterSpacing: 4, textTransform: 'uppercase', color: couleur }}>
      <div style={{ display: 'flex', width: 36, height: 4, borderRadius: 2, background: h.palette.accent, marginRight: 14 }} />
      {h.textes.surtitre}
    </div>
  )
}

function Bouton({ h, plein = true }: { h: Habillage; plein?: boolean }) {
  if (!h.textes.bouton) return null
  const fond = plein ? h.palette.principale : '#ffffff'
  return (
    <div style={{ display: 'flex', alignSelf: 'flex-start', alignItems: 'center', padding: '22px 40px', borderRadius: 999, background: fond, color: surFond(fond), fontFamily: h.polices.texte, fontWeight: 600, fontSize: 32, boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
      {h.textes.bouton}
      <span style={{ marginLeft: 16 }}>→</span>
    </div>
  )
}

/** L'offre en macaron rond, penché, aux couleurs d'accent. */
function Macaron({ h, taille: d = 230 }: { h: Habillage; taille?: number }) {
  if (!h.textes.offre) return null
  return (
    <div style={{ display: 'flex', width: d, height: d, borderRadius: d, background: h.palette.accent, color: surFond(h.palette.accent), alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 26, transform: 'rotate(-8deg)', boxShadow: '0 12px 30px rgba(0,0,0,0.3)', fontFamily: h.polices.titre, fontWeight: 800, fontSize: taille(h.textes.offre, 40, 24), lineHeight: 1.1 }}>
      {h.textes.offre}
    </div>
  )
}

/** Le logo : version claire sur fond sombre si le kit l'a, sinon le logo sur une pastille blanche. */
function Logo({ h, sombre, hauteur = 72 }: { h: Habillage; sombre: boolean; hauteur?: number }) {
  const clair = sombre && h.logoClair
  const src = clair ? h.logoClair : h.logo
  if (!src) return <div style={{ display: 'flex', fontFamily: h.polices.titre, fontWeight: 800, fontSize: 40, color: sombre ? '#ffffff' : h.palette.sombre }}>{h.nom}</div>
  return (
    <div style={{ display: 'flex', alignSelf: 'flex-start', padding: clair || !sombre ? 0 : '12px 20px', borderRadius: 16, background: clair || !sombre ? 'transparent' : '#ffffff' }}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={src} height={hauteur} style={{ height: hauteur, objectFit: 'contain' }} />
    </div>
  )
}

function Visuel({ src, l, hauteur, rayon = 0 }: { src: string | null; l: number; hauteur: number; rayon?: number }) {
  if (!src) return <div style={{ display: 'flex', width: l, height: hauteur, borderRadius: rayon, background: 'rgba(255,255,255,0.08)' }} />
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img src={src} width={l} height={hauteur} style={{ width: l, height: hauteur, objectFit: 'cover', borderRadius: rayon }} />
}

// Les signes ✓ et ✕ manquent à beaucoup de polices : dessinés en SVG.
const Coche = ({ couleur, fond, d = 52, non }: { couleur: string; fond: string; d?: number; non?: boolean }) => (
  <div style={{ display: 'flex', width: d, height: d, borderRadius: d, background: fond, alignItems: 'center', justifyContent: 'center', marginRight: d * 0.42, flexShrink: 0 }}>
    <svg width={d * 0.54} height={d * 0.54} viewBox="0 0 24 24">
      <path d={non ? 'M7 7l10 10M17 7L7 17' : 'M5 12.5l4.5 4.5L19 7.5'} fill="none" stroke={couleur} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
)

// ─── Gabarits ───────────────────────────────────────────────────────────────
// `H` : hauteur totale ; `marge` : 20 % en Story (fond seulement), 72 px en carré.

type Cadre = { h: Habillage; H: number; marge: number; story: boolean }

/** Photo pleine page, dégradé sombre sous le texte : mise en situation, UGC, gros plan. */
function GPhoto({ h, H, marge, story }: Cadre) {
  const s = h.palette.sombre
  const polaroid = h.style === 'polaroid'
  return (
    <div style={{ display: 'flex', width: L, height: H, position: 'relative', background: s }}>
      {polaroid ? (
        <div style={{ display: 'flex', position: 'absolute', top: marge + 150, left: 110, padding: '26px 26px 90px', background: '#ffffff', transform: 'rotate(-3deg)', boxShadow: '0 20px 50px rgba(0,0,0,0.45)' }}>
          <Visuel src={h.visuel} l={L - 272} hauteur={story ? 760 : 560} />
        </div>
      ) : (
        <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0 }}><Visuel src={h.visuel} l={L} hauteur={H} /></div>
      )}
      <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: L, height: H, backgroundImage: polaroid ? `linear-gradient(180deg, ${alpha(s, 0.2)} 0%, ${alpha(s, 0.95)} 75%)` : `linear-gradient(180deg, ${alpha(s, 0.55)} 0%, ${alpha(s, 0)} 22%, ${alpha(s, 0.45)} 42%, ${alpha(s, 0.96)} 68%)` }} />
      <div style={{ display: 'flex', position: 'absolute', top: marge, left: 72 }}><Logo h={h} sombre /></div>
      {h.textes.offre && <div style={{ display: 'flex', position: 'absolute', top: marge - 10, right: 60 }}><Macaron h={h} taille={210} /></div>}
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 72, right: 72, bottom: marge, gap: 22 }}>
        <Surtitre h={h} couleur="#ffffff" />
        <Titre h={h} couleur="#ffffff" grand={story ? 100 : 88} petit={story ? 58 : 50} />
        <Texte h={h} couleur="rgba(255,255,255,0.9)">{h.textes.sousTitre}</Texte>
        <div style={{ display: 'flex', marginTop: 10 }}><Bouton h={h} /></div>
        <Texte h={h} couleur="rgba(255,255,255,0.65)" taille={22}>{h.textes.mention}</Texte>
      </div>
    </div>
  )
}

/** Deux moitiés légendées (avant / après, problème / solution) ; le visuel est une seule image déjà coupée en deux. */
function GSplit({ h, H, marge, story }: Cadre) {
  const s = h.palette.sombre
  const haut = story ? 640 : 520
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: L, height: H, background: s, padding: `${marge}px 0 ${marge}px`, justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '0 72px' }}>
        <Logo h={h} sombre hauteur={60} />
        <Titre h={h} couleur="#ffffff" grand={story ? 84 : 72} petit={48} />
      </div>
      <div style={{ display: 'flex', position: 'relative', width: L, height: haut }}>
        <Visuel src={h.visuel} l={L} hauteur={haut} />
        <div style={{ display: 'flex', position: 'absolute', top: 0, left: L / 2 - 3, width: 6, height: haut, background: '#ffffff' }} />
        {[h.textes.gauche, h.textes.droite].map((t, i) => t && (
          <div key={i} style={{ display: 'flex', position: 'absolute', bottom: 24, left: i ? L / 2 + 24 : 24, padding: '12px 22px', borderRadius: 999, background: i ? h.palette.accent : 'rgba(0,0,0,0.65)', color: i ? surFond(h.palette.accent) : '#ffffff', fontFamily: h.polices.titre, fontWeight: 800, fontSize: 30, textTransform: 'uppercase', letterSpacing: 2 }}>{t}</div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '0 72px' }}>
        <Texte h={h} couleur="rgba(255,255,255,0.88)">{h.textes.sousTitre}</Texte>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Bouton h={h} />
          <Texte h={h} couleur={h.palette.accent} taille={30} poids={600}>{h.textes.offre}</Texte>
        </div>
      </div>
    </div>
  )
}

/** Titre et points cochés (ou étapes numérotées) sur fond sombre, photo en carte arrondie. */
function GListe({ h, H, marge, story }: Cadre) {
  const s = h.palette.sombre
  const numeros = h.style === 'numeros'
  // Au carré, quatre points remplissent la place : la photo ne vient qu'en Story.
  const points = h.textes.points.slice(0, 4)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: L, height: H, padding: `${marge}px 72px`, backgroundImage: `linear-gradient(160deg, ${melanger(s, h.palette.principale, 0.25)} 0%, ${s} 70%)`, gap: story ? 28 : 26 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Logo h={h} sombre hauteur={60} />
        <Texte h={h} couleur={h.palette.accent} taille={26} poids={600}>{h.textes.surtitre}</Texte>
      </div>
      <Titre h={h} couleur="#ffffff" grand={story ? 86 : 72} petit={46} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: story ? 22 : 16 }}>
        {points.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '18px 24px', borderRadius: 20, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
            {numeros ? (
              <div style={{ display: 'flex', width: 52, height: 52, borderRadius: 52, background: h.palette.accent, color: surFond(h.palette.accent), alignItems: 'center', justifyContent: 'center', marginRight: 22, fontFamily: h.polices.titre, fontWeight: 800, fontSize: 28, flexShrink: 0 }}>{i + 1}</div>
            ) : (
              <Coche couleur={surFond(h.palette.accent)} fond={h.palette.accent} />
            )}
            <div style={{ display: 'flex', flex: 1, fontFamily: h.polices.texte, fontWeight: 600, fontSize: taille(p, 34, 26), lineHeight: 1.25, color: '#ffffff' }}>{p}</div>
          </div>
        ))}
      </div>
      {h.visuel && story && <Visuel src={h.visuel} l={L - 144} hauteur={220} rayon={24} />}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
        <Bouton h={h} />
        <Texte h={h} couleur={h.palette.accent} taille={30} poids={600}>{h.textes.offre}</Texte>
      </div>
    </div>
  )
}

/** Le texte seul, très grand : typographique, minimaliste, offre promo. */
function GTypo({ h, H, marge, story }: Cadre) {
  const clair = h.style === 'minimaliste'
  const fond = clair ? h.palette.fond : h.palette.principale
  const encre = surFond(fond)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: L, height: H, padding: `${marge}px 80px`, background: clair ? fond : `linear-gradient(150deg, ${melanger(fond, '#ffffff', 0.08)} 0%, ${melanger(fond, '#000000', 0.35)} 100%)`, justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Logo h={h} sombre={encre === '#ffffff'} hauteur={64} />
        {h.textes.offre && <Macaron h={h} taille={story ? 250 : 210} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <Surtitre h={h} couleur={encre} />
        <Titre h={h} couleur={encre} grand={story ? 132 : 116} petit={64} />
        <Texte h={h} couleur={encre === '#ffffff' ? 'rgba(255,255,255,0.85)' : '#3f3f46'} taille={36}>{h.textes.sousTitre}</Texte>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Bouton h={h} plein={encre !== '#ffffff'} />
        {h.visuel && <Visuel src={h.visuel} l={story ? 300 : 240} hauteur={story ? 300 : 240} rayon={story ? 300 : 240} />}
      </div>
    </div>
  )
}

/** Comme un article ou une publication : bandeau, titre, photo, extrait. Le style « citation » le fait témoignage. */
function GEditorial({ h, H, marge, story }: Cadre) {
  const citation = h.style === 'citation'
  return (
    <div style={{ display: 'flex', width: L, height: H, padding: `${marge}px 56px`, background: h.palette.fond }}>
      <div style={{ display: 'flex', flexDirection: 'column', width: L - 112, background: '#ffffff', borderRadius: 28, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 36px', borderBottom: '1px solid #ececf1' }}>
          <Logo h={h} sombre={false} hauteur={52} />
          <Texte h={h} couleur="#6b7280" taille={24} poids={600}>{h.textes.surtitre}</Texte>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', padding: '30px 36px 0', gap: 18 }}>
          {citation && <div style={{ display: 'flex', fontFamily: h.polices.titre, fontWeight: 800, fontSize: 120, lineHeight: 0.6, color: h.palette.accent }}>“</div>}
          <Titre h={h} couleur="#0d0d12" grand={story ? 76 : 64} petit={42} />
        </div>
        <div style={{ display: 'flex', flex: 1, padding: '26px 36px', minHeight: 0 }}>
          <Visuel src={h.visuel} l={L - 184} hauteur={story ? 560 : 330} rayon={18} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '0 36px 32px' }}>
          <Texte h={h} couleur="#3f3f46" taille={30}>{h.textes.sousTitre}</Texte>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Bouton h={h} />
            <Texte h={h} couleur={h.palette.principale} taille={28} poids={600}>{h.textes.offre}</Texte>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Le produit au centre sur fond clair, prix ou offre en étiquette, trois arguments. */
function GProduit({ h, H, marge, story }: Cadre) {
  const fond = h.palette.fond
  const encre = surFond(fond)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: L, height: H, padding: `${marge}px 72px`, background: `radial-gradient(circle at 50% 55%, #ffffff 0%, ${fond} 70%)`, gap: story ? 30 : 20 }}>
      <Logo h={h} sombre={false} hauteur={60} />
      <Titre h={h} couleur={encre} grand={story ? 84 : 70} petit={44} centre />
      <div style={{ display: 'flex', position: 'relative' }}>
        <Visuel src={h.visuel} l={story ? 760 : 560} hauteur={story ? 640 : 430} rayon={28} />
        {h.textes.offre && <div style={{ display: 'flex', position: 'absolute', right: -60, top: -40 }}><Macaron h={h} taille={story ? 220 : 190} /></div>}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
        {h.textes.points.slice(0, 3).map((p, i) => (
          <div key={i} style={{ display: 'flex', padding: '12px 22px', borderRadius: 999, background: '#ffffff', border: `2px solid ${alpha(h.palette.principale, 0.25)}`, fontFamily: h.polices.texte, fontWeight: 600, fontSize: 26, color: '#0d0d12' }}>{p}</div>
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: 'auto' }}><Bouton h={h} /></div>
    </div>
  )
}

/** Deux colonnes : la marque face à la solution habituelle, sans nommer de concurrent. */
function GComparatif({ h, H, marge, story }: Cadre) {
  const s = h.palette.sombre
  const lignes = h.textes.points.slice(0, story ? 5 : 4)
  const colonne = (titre: string, bon: boolean) => (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 28, borderRadius: 24, background: bon ? h.palette.principale : 'rgba(255,255,255,0.06)', border: bon ? 'none' : '1px solid rgba(255,255,255,0.15)', gap: 18 }}>
      <div style={{ display: 'flex', fontFamily: h.polices.titre, fontWeight: 800, fontSize: 34, color: bon ? surFond(h.palette.principale) : 'rgba(255,255,255,0.7)' }}>{titre}</div>
      {lignes.map((p, i) => {
        const [oui, non] = p.split('|').map((x) => x.trim())
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', fontFamily: h.polices.texte, fontSize: 26, lineHeight: 1.25, color: bon ? surFond(h.palette.principale) : 'rgba(255,255,255,0.6)' }}>
            <Coche d={36} non={!bon} couleur={bon ? h.palette.principale : 'rgba(255,255,255,0.7)'} fond={bon ? surFond(h.palette.principale) : 'rgba(255,255,255,0.1)'} />
            <div style={{ display: 'flex', flex: 1 }}>{bon ? oui : non ?? ''}</div>
          </div>
        )
      })}
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: L, height: H, padding: `${marge}px 64px`, background: s, gap: story ? 40 : 28 }}>
      <Logo h={h} sombre hauteur={56} />
      <Titre h={h} couleur="#ffffff" grand={story ? 80 : 68} petit={44} />
      <div style={{ display: 'flex', gap: 22 }}>
        {colonne(h.textes.gauche || h.nom, true)}
        {colonne(h.textes.droite || 'Ailleurs', false)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
        <Bouton h={h} />
        <Texte h={h} couleur={h.palette.accent} taille={30} poids={600}>{h.textes.offre}</Texte>
      </div>
    </div>
  )
}

const RENDUS: Record<Gabarit, (c: Cadre) => JSX.Element> = {
  photo: GPhoto, split: GSplit, liste: GListe, typo: GTypo, editorial: GEditorial, produit: GProduit, comparatif: GComparatif,
}

/** La créa en PNG : 1080 × 1080, ou 1080 × 1920 avec 384 px de fond seul en haut et en bas. */
export async function rendre(h: Habillage, format: '1:1' | '9:16'): Promise<Buffer> {
  const story = format === '9:16'
  const H = story ? 1920 : L
  const image = new ImageResponse(RENDUS[h.gabarit]({ h, H, marge: story ? 384 : 72, story }), { width: L, height: H, fonts: h.polices.fonts })
  return Buffer.from(await image.arrayBuffer())
}
