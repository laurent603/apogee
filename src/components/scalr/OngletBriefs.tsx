'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { markdownToHtml } from '@/lib/markdown'

/**
 * Les briefs créa : la liste, et leur avancement.
 *
 * Un brief n'est pas une analyse. Une analyse se lit une fois et s'archive ;
 * un brief **se produit** — il part en tournage, revient monté, puis passe en
 * ligne. C'est pour ça qu'il porte un statut et qu'il vit ici plutôt que dans
 * l'historique : mêlé aux analyses par ordre chronologique, on ne saurait plus
 * lesquels ont été tournés.
 *
 * Il se génère depuis une créa, jamais du vide : ce sont ses chiffres qui
 * permettent de dire quelle faiblesse le brief corrige.
 */

export type BriefListe = {
  id: string; title: string; adId: string; adName: string; statut: string
  ton: string | null; conscience: string | null; format: string | null
  downloadedAt: string | null; createdAt: string
}

export const STATUTS = [
  { id: 'a_produire', label: 'À produire', teinte: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'produit', label: 'Produit', teinte: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'lance', label: 'Lancé', teinte: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
]
const infoStatut = (s: string) => STATUTS.find((x) => x.id === s) || STATUTS[0]

const horodatage = (d: string) => new Date(d).toLocaleDateString('fr-FR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
})

export function OngletBriefs({ compte }: {
  compte?: { id: string; name?: string | null } | null
}) {
  const [briefs, setBriefs] = useState<BriefListe[]>([])
  const [compteurs, setCompteurs] = useState<{ statut: string; nombre: number }[]>([])
  const [filtre, setFiltre] = useState('all')
  const [recherche, setRecherche] = useState('')
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [contenu, setContenu] = useState<Record<string, string>>({})
  const [chargement, setChargement] = useState(true)

  const charger = useCallback(() => {
    if (!compte?.id) { setBriefs([]); setChargement(false); return }
    setChargement(true)
    fetch(`/api/briefs?dbAccountId=${compte.id}`)
      .then((r) => r.json())
      .then((d) => { setBriefs(d?.briefs || []); setCompteurs(d?.statuts || []) })
      .catch(() => setBriefs([]))
      .finally(() => setChargement(false))
  }, [compte?.id])

  useEffect(() => { charger() }, [charger])

  /** Le texte n'est tiré qu'à l'ouverture : la liste ne le porte pas. */
  async function ouvrir(b: BriefListe) {
    if (ouvert === b.id) { setOuvert(null); return }
    setOuvert(b.id)
    if (contenu[b.id]) return
    const d = await fetch(`/api/briefs?id=${b.id}`).then((r) => r.json()).catch(() => null)
    if (d?.brief?.content) setContenu((c) => ({ ...c, [b.id]: d.brief.content }))
  }

  async function changerStatut(b: BriefListe, statut: string) {
    setBriefs((l) => l.map((x) => (x.id === b.id ? { ...x, statut } : x)))
    await fetch('/api/briefs', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: b.id, statut }),
    }).catch(() => {})
    setCompteurs((c) => {
      const m = new Map(c.map((x) => [x.statut, x.nombre]))
      m.set(b.statut, Math.max(0, (m.get(b.statut) || 1) - 1))
      m.set(statut, (m.get(statut) || 0) + 1)
      return [...m].map(([s, n]) => ({ statut: s, nombre: n }))
    })
  }

  async function telecharger(b: BriefListe) {
    const texte = contenu[b.id]
    if (!texte) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([texte], { type: 'text/markdown;charset=utf-8' }))
    a.download = `${b.title.replace(/[^\w\sÀ-ÿ-]/g, '').slice(0, 60).trim() || 'brief'}.md`
    a.click()
    URL.revokeObjectURL(a.href)

    const d = await fetch('/api/briefs', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: b.id, telecharge: true }),
    }).then((x) => x.json()).catch(() => null)
    if (d?.brief?.downloadedAt) {
      setBriefs((l) => l.map((x) => (x.id === b.id ? { ...x, downloadedAt: d.brief.downloadedAt } : x)))
    }
  }

  const visibles = useMemo(() => {
    let l = briefs
    if (filtre !== 'all') l = l.filter((b) => b.statut === filtre)
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      l = l.filter((b) => `${b.title} ${b.adName}`.toLowerCase().includes(q))
    }
    return l
  }, [briefs, filtre, recherche])

  const nombre = (s: string) => compteurs.find((c) => c.statut === s)?.nombre ?? 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[{ id: 'all', label: 'Tous', n: briefs.length },
            ...STATUTS.map((s) => ({ id: s.id, label: s.label, n: nombre(s.id) }))].map((o) => (
            <button key={o.id} onClick={() => setFiltre(o.id)}
              className={clsx('px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                filtre === o.id ? 'bg-[#3434ef] text-white border-[#3434ef]'
                  : 'bg-white text-gray-600 border-[#E5E7EB] hover:border-gray-300')}>
              {o.label} <span className={filtre === o.id ? 'text-white/70' : 'text-gray-400'}>{o.n}</span>
            </button>
          ))}
        </div>
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher une créa…" className="input w-auto text-sm py-1.5 min-w-[180px]" />
      </div>

      {chargement && <div className="card text-center py-16 text-gray-400 text-sm">Chargement…</div>}

      {!chargement && !visibles.length && (
        <div className="card text-center py-14">
          <p className="text-[#0d0d12] font-medium">
            {briefs.length ? 'Aucun brief pour ce filtre.' : 'Aucun brief pour ce compte.'}
          </p>
          <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto leading-relaxed">
            Un brief se génère depuis une créa, dans <strong>Media buying → Créas</strong> :
            ouvrez une publicité et cliquez « Générer un brief ». Ses chiffres et son analyse
            nourrissent le script — c’est ce qui lui permet de dire quelle faiblesse il corrige.
          </p>
        </div>
      )}

      {!chargement && visibles.length > 0 && (
        <div className="space-y-2.5">
          {visibles.map((b) => {
            const estOuvert = ouvert === b.id
            const st = infoStatut(b.statut)
            return (
              <div key={b.id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-[#0d0d12] break-words">{b.adName}</p>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className={clsx('inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border', st.teinte)}>
                        {st.label}
                      </span>
                      {b.format && <span>{b.format}</span>}
                      {b.ton && <span>· {b.ton}</span>}
                      {b.downloadedAt && (
                        <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                          Téléchargé le {horodatage(b.downloadedAt)}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* L'avancement se change là où on lit le brief : y revenir
                        depuis un autre écran ferait perdre le fil. */}
                    <select value={b.statut} onChange={(e) => changerStatut(b, e.target.value)}
                      className="text-xs border border-[#E5E7EB] rounded-lg px-2 h-8 bg-white text-gray-600 focus:outline-none focus:border-[#3434ef]">
                      {STATUTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">{horodatage(b.createdAt)}</span>
                    <button onClick={() => ouvrir(b)} className="text-xs text-[#3434ef] hover:underline">
                      {estOuvert ? 'Masquer' : 'Lire'}
                    </button>
                  </div>
                </div>

                {estOuvert && (
                  <div className="mt-3 pt-3 border-t border-[#F3F4F6]">
                    {contenu[b.id] ? (
                      <>
                        <div className="chat-report bg-[#f8f9fc] rounded-lg p-4 max-h-[560px] overflow-y-auto"
                          dangerouslySetInnerHTML={{ __html: markdownToHtml(contenu[b.id]) }} />
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={() => telecharger(b)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-[#E5E7EB] text-gray-600 hover:border-[#3434ef] hover:text-[#3434ef]">
                            Télécharger en Markdown
                          </button>
                          <a href={`/pilotage?niveau=crea`} className="text-xs text-[#3434ef] hover:underline">
                            Revoir la créa d’origine →
                          </a>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">Chargement…</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
