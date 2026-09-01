'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { clsx } from 'clsx'
import { markdownToHtml } from '@/lib/markdown'

/**
 * L'historique du compte : ce qui s'est passé, dans l'ordre.
 *
 * Il ne montrait que les lancements. Les analyses — quatre-vingt-quatre en
 * base — étaient bien enregistrées et **aucune page ne les affichait** : la
 * modale d'une créa donnait l'impression de jeter son travail alors qu'il
 * était conservé.
 *
 * Un lancement et une analyse sont deux choses qui se sont produites sur le
 * compte ; les séparer en deux écrans obligerait à se souvenir laquelle
 * chercher où. Une seule liste chronologique, donc, avec le type en filtre —
 * « Lancements » y étant un type parmi les autres — et chaque ligne rendue
 * selon ce qu'elle est : un lancement montre ses compteurs et son journal, une
 * analyse s'ouvre sur son texte.
 */

type Lancement = {
  id: string; metaAccountId: string; campaignName: string
  objective: string | null; structure: string | null
  adsetCount: number; adCount: number; status: string; logs: string; createdAt: string
}

type Rapport = {
  id: string; title: string; type: string
  adId: string | null; adName: string | null; createdAt: string
  downloadedAt: string | null
}

type Entree =
  | ({ genre: 'lancement'; date: string } & Lancement)
  | ({ genre: 'rapport'; date: string } & Rapport)

/** Les catégories techniques ne se montrent pas telles quelles. */
const NOMS_TYPE: Record<string, string> = {
  creativeStrategy: 'Analyse créa',
  creative: 'Analyse créa',
  audit: 'Audit technique',
  autopilot: 'Autopilot',
  session: 'Discussion',
  mediaBuying: 'Média buying',
  performance: 'Performance',
}
const nomType = (t: string) => NOMS_TYPE[t] || t

const TEINTE_TYPE: Record<string, string> = {
  creativeStrategy: 'bg-violet-50 text-violet-700 border-violet-200',
  creative: 'bg-violet-50 text-violet-700 border-violet-200',
  audit: 'bg-amber-50 text-amber-700 border-amber-200',
  autopilot: 'bg-blue-50 text-blue-700 border-blue-200',
  session: 'bg-gray-100 text-gray-600 border-gray-200',
  mediaBuying: 'bg-teal-50 text-teal-700 border-teal-200',
  performance: 'bg-teal-50 text-teal-700 border-teal-200',
}

const horodatage = (d: string) => {
  const x = new Date(d)
  return `${x.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

export default function HistoryPage() {
  const { selectedAccount } = useStore()
  const [lancements, setLancements] = useState<Lancement[]>([])
  const [rapports, setRapports] = useState<Rapport[]>([])
  const [typesDispo, setTypesDispo] = useState<{ type: string; nombre: number }[]>([])
  const [filtre, setFiltre] = useState('all')
  const [recherche, setRecherche] = useState('')
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [contenu, setContenu] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const charger = useCallback(() => {
    setLoading(true)
    const metaId = selectedAccount?.metaAccountId || selectedAccount?.id
    Promise.all([
      fetch(metaId ? `/api/launch-history?metaAccountId=${metaId}` : '/api/launch-history')
        .then((r) => r.json()).catch(() => []),
      selectedAccount?.id
        ? fetch(`/api/reports?dbAccountId=${selectedAccount.id}`).then((r) => r.json()).catch(() => ({}))
        : Promise.resolve({}),
    ]).then(([l, r]) => {
      setLancements(Array.isArray(l) ? l : [])
      setRapports(r?.reports || [])
      setTypesDispo(r?.types || [])
      setLoading(false)
    })
  }, [selectedAccount?.id, selectedAccount?.metaAccountId])

  useEffect(() => { charger() }, [charger])

  /** Le texte n'est tiré qu'à l'ouverture : la liste ne le porte pas. */
  async function ouvrir(r: Rapport) {
    if (ouvert === r.id) { setOuvert(null); return }
    setOuvert(r.id)
    if (contenu[r.id]) return
    const d = await fetch(`/api/reports?id=${r.id}`).then((x) => x.json()).catch(() => null)
    if (d?.report?.content) setContenu((c) => ({ ...c, [r.id]: d.report.content }))
  }

  async function telecharger(r: Rapport) {
    const texte = contenu[r.id]
    if (!texte) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([texte], { type: 'text/markdown;charset=utf-8' }))
    // Un nom de fichier lisible dans un dossier de téléchargements.
    a.download = `${r.title.replace(/[^\w\sÀ-ÿ-]/g, '').slice(0, 60).trim() || 'analyse'}.md`
    a.click()
    URL.revokeObjectURL(a.href)

    // La marque va en base : sans trace, elle disparaîtrait au rafraîchissement
    // et on ne saurait plus ce qui a déjà été transmis à un client.
    const d = await fetch('/api/reports', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id }),
    }).then((x) => x.json()).catch(() => null)
    if (d?.downloadedAt) {
      setRapports((liste) => liste.map((x) => (x.id === r.id ? { ...x, downloadedAt: d.downloadedAt } : x)))
    }
  }

  const entrees = useMemo<Entree[]>(() => {
    const l: Entree[] = lancements.map((x) => ({ ...x, genre: 'lancement', date: x.createdAt }))
    const r: Entree[] = rapports.map((x) => ({ ...x, genre: 'rapport', date: x.createdAt }))
    let tout = [...l, ...r]
    if (filtre === 'lancement') tout = l
    else if (filtre !== 'all') tout = r.filter((x) => x.genre === 'rapport' && x.type === filtre)
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      tout = tout.filter((x) =>
        (x.genre === 'lancement' ? x.campaignName : `${x.title} ${x.adName ?? ''}`).toLowerCase().includes(q))
    }
    return tout.sort((a, b) => b.date.localeCompare(a.date))
  }, [lancements, rapports, filtre, recherche])

  const onglets = [
    { id: 'all', label: 'Tout', n: lancements.length + rapports.length },
    { id: 'lancement', label: 'Lancements', n: lancements.length },
    ...typesDispo.map((t) => ({ id: t.type, label: nomType(t.type), n: t.nombre })),
  ]

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Historique</h1>
          <p className="page-subtitle mt-0.5">
            Lancements et analyses pour <strong>{selectedAccount?.name || 'tous les comptes'}</strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher…" className="input w-auto text-sm py-1.5 min-w-[160px]" />
          <button onClick={charger} className="text-xs text-[#3434ef] hover:underline">Actualiser</button>
        </div>
      </div>

      {/* Le type en filtre, « Lancements » y compris. */}
      <div className="flex flex-wrap gap-2">
        {onglets.filter((o) => o.n > 0 || o.id === 'all').map((o) => (
          <button key={o.id} onClick={() => setFiltre(o.id)}
            className={clsx('px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
              filtre === o.id ? 'bg-[#3434ef] text-white border-[#3434ef]'
                : 'bg-white text-gray-600 border-[#E5E7EB] hover:border-gray-300')}>
            {o.label} <span className={filtre === o.id ? 'text-white/70' : 'text-gray-400'}>{o.n}</span>
          </button>
        ))}
      </div>

      {loading && <div className="card text-center py-20 text-gray-400 text-sm">Chargement…</div>}

      {!loading && !entrees.length && (
        <div className="card text-center py-16">
          <p className="text-[#0d0d12] font-medium">Rien à afficher pour ce filtre.</p>
          <p className="text-sm text-gray-400 mt-1">
            Les lancements et les analyses de ce compte apparaissent ici, du plus récent au plus ancien.
          </p>
        </div>
      )}

      {!loading && entrees.length > 0 && (
        <div className="space-y-2.5">
          {entrees.map((e) => {
            const estOuvert = ouvert === e.id

            if (e.genre === 'lancement') {
              return (
                <div key={e.id} className="card">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className={clsx('mt-1 w-2 h-2 rounded-full flex-shrink-0',
                        e.status === 'success' ? 'bg-emerald-500' : 'bg-red-500')} />
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-[#0d0d12] truncate">{e.campaignName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-gray-50 text-gray-600 border-gray-200 mr-1.5">
                            Lancement
                          </span>
                          {e.adsetCount} ad set{e.adsetCount !== 1 ? 's' : ''} · {e.adCount} pub{e.adCount !== 1 ? 's' : ''}
                          {e.objective && <> · {e.objective}</>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 pl-5 sm:pl-0">
                      <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">{horodatage(e.date)}</span>
                      <button onClick={() => setOuvert(estOuvert ? null : e.id)}
                        className="text-xs text-[#3434ef] hover:underline">
                        {estOuvert ? 'Masquer' : 'Journal'}
                      </button>
                    </div>
                  </div>
                  {estOuvert && (
                    <pre className="mt-3 pt-3 border-t border-[#F3F4F6] text-xs text-gray-600 whitespace-pre-wrap font-mono bg-[#f8f9fc] rounded-lg p-3 max-h-60 overflow-y-auto">
                      {e.logs || '(vide)'}
                    </pre>
                  )}
                </div>
              )
            }

            return (
              <div key={e.id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-[#0d0d12] break-words">{e.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      <span className={clsx('inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border mr-1.5',
                        TEINTE_TYPE[e.type] || 'bg-gray-50 text-gray-600 border-gray-200')}>
                        {nomType(e.type)}
                      </span>
                      {e.adName ? <>sur {e.adName}</> : 'sur l’ensemble du compte'}
                      {e.downloadedAt && (
                        <span className="inline-block ml-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                          Téléchargé le {new Date(e.downloadedAt).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">{horodatage(e.date)}</span>
                    <button onClick={() => ouvrir(e)} className="text-xs text-[#3434ef] hover:underline">
                      {estOuvert ? 'Masquer' : 'Lire'}
                    </button>
                  </div>
                </div>

                {estOuvert && (
                  <div className="mt-3 pt-3 border-t border-[#F3F4F6]">
                    {contenu[e.id] ? (
                      <>
                        {/* Le rapport est du Markdown : le rendre en texte brut
                            noyait les titres dans les dièses et laissait les
                            tableaux en barres verticales. */}
                        <div className="chat-report bg-[#f8f9fc] rounded-lg p-4 max-h-[560px] overflow-y-auto"
                          dangerouslySetInnerHTML={{ __html: markdownToHtml(contenu[e.id]) }} />
                        <button onClick={() => telecharger(e)}
                          className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-[#E5E7EB] text-gray-600 hover:border-[#3434ef] hover:text-[#3434ef]">
                          Télécharger en Markdown
                        </button>
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
