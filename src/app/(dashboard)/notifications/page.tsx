'use client'
import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

interface Incident {
  id: string
  level: 'error' | 'warning' | string
  source: string
  title: string
  message: string
  cause: string | null
  context: string | null
  accountName: string | null
  agentName: string | null
  occurrences: number
  mailedAt: string | null
  isRead: boolean
  lastSeenAt: string
  createdAt: string
}

const SOURCE_LABEL: Record<string, string> = {
  launch: 'Lancement',
  agent_cron: 'Agent automatique',
  agent_chat: 'Analyse interactive',
  comments: 'Commentaires',
  delivery: 'Livraison',
  enrichment: 'Données',
}

function when(iso: string) {
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return "à l'instant"
  if (mins < 60) return `il y a ${mins} min`
  if (mins < 1440) return `il y a ${Math.round(mins / 60)} h`
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function NotificationsPage() {
  const { selectedAccount } = useStore()
  const [items, setItems] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'error' | 'warning'>('all')
  const [orphans, setOrphans] = useState(0)
  const [showOrphans, setShowOrphans] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const q = showOrphans
      ? '?unassigned=1'
      : selectedAccount?.id ? `?dbAccountId=${selectedAccount.id}` : ''
    fetch(`/api/notifications${q}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(Array.isArray(d.items) ? d.items : [])
        setOrphans(d.orphans || 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selectedAccount?.id, showOrphans])

  useEffect(() => { load() }, [load])

  async function markRead(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isRead: true } : i)))
    await fetch('/api/notifications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {})
  }

  async function markAllRead() {
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })))
    await fetch('/api/notifications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        showOrphans ? { allRead: true, unassigned: true } : { allRead: true, dbAccountId: selectedAccount?.id }
      ),
    }).catch(() => {})
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    await fetch(`/api/notifications?id=${id}`, { method: 'DELETE' }).catch(() => {})
    toast.success('Incident supprimé')
  }

  const shown = items.filter((i) => filter === 'all' || i.level === filter)
  const unread = items.filter((i) => !i.isRead).length
  const errors = items.filter((i) => i.level === 'error').length
  const warnings = items.filter((i) => i.level === 'warning').length

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle mt-0.5">
            Incidents de lancement, d&apos;agents et d&apos;analyses —{' '}
            {showOrphans
              ? 'incidents non rattachés à un compte'
              : selectedAccount?.name || 'tous les comptes'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs text-[#3434ef] hover:underline">
              Tout marquer comme lu
            </button>
          )}
          <button onClick={load} className="text-xs text-gray-400 hover:text-[#0d0d12]">Actualiser</button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="flex gap-1 bg-[#f8f9fc] rounded-xl p-1 border border-[#E5E7EB] w-full sm:w-fit overflow-x-auto">
          {([
            ['all', `Tout (${items.length})`],
            ['error', `Erreurs (${errors})`],
            ['warning', `Avertissements (${warnings})`],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-shrink-0',
                filter === id ? 'bg-white text-[#3434ef] shadow-sm border border-[#E5E7EB]' : 'text-gray-500 hover:text-[#0d0d12]'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Un incident sans compte n'est jamais affiché sous un autre : il
          serait attribué à tort. Il reste atteignable ici. */}
      {orphans > 0 && (
        <button
          onClick={() => setShowOrphans((v) => !v)}
          className="w-full text-left rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-center gap-2.5 hover:bg-amber-100/70 transition-colors"
        >
          <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-amber-900 flex-1">
            {showOrphans
              ? 'Vous consultez les incidents sans compte rattaché.'
              : `${orphans} incident${orphans > 1 ? 's' : ''} sans compte rattaché — non affiché${orphans > 1 ? 's' : ''} ici pour ne pas l${orphans > 1 ? 'es' : "'"}attribuer à tort.`}
          </p>
          <span className="text-xs font-medium text-amber-700 flex-shrink-0">
            {showOrphans ? 'Revenir au compte' : 'Les voir'}
          </span>
        </button>
      )}

      {loading && <div className="card text-center py-16 text-gray-400 text-sm">Chargement…</div>}

      {!loading && shown.length === 0 && (
        <div className="card text-center py-16">
          <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-semibold text-[#0d0d12] mb-1">
            {items.length === 0 ? 'Aucun incident' : 'Rien dans ce filtre'}
          </h3>
          <p className="text-sm text-gray-400 max-w-sm mx-auto">
            {items.length === 0
              ? 'Les échecs de lancement, d\'agents et d\'analyses apparaîtront ici. Le silence est bon signe.'
              : 'Changez de filtre pour voir les autres incidents.'}
          </p>
        </div>
      )}

      {!loading && shown.length > 0 && (
        <div className="space-y-2">
          {shown.map((n) => {
            const isOpen = open === n.id
            const isError = n.level === 'error'
            return (
              <div
                key={n.id}
                className={clsx(
                  'card p-0 overflow-hidden transition-shadow',
                  !n.isRead && (isError ? 'ring-1 ring-red-200' : 'ring-1 ring-amber-200')
                )}
              >
                <button
                  onClick={() => { setOpen(isOpen ? null : n.id); if (!n.isRead) markRead(n.id) }}
                  className="w-full text-left px-4 sm:px-5 py-4 flex items-start gap-3 hover:bg-[#f8f9fc] transition-colors"
                >
                  <div className={clsx(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                    isError ? 'bg-red-50' : 'bg-amber-50'
                  )}>
                    <svg className={clsx('w-4 h-4', isError ? 'text-red-600' : 'text-amber-600')}
                         fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                            d={isError
                              ? 'M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                              : 'M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.33 16a2 2 0 001.74 3z'} />
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={clsx('text-sm', n.isRead ? 'font-medium text-[#0d0d12]' : 'font-semibold text-[#0d0d12]')}>
                        {n.title}
                      </span>
                      {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-[#3434ef] flex-shrink-0" />}
                      <span className="text-[10px] text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                        {SOURCE_LABEL[n.source] || n.source}
                      </span>
                      {n.occurrences > 1 && (
                        <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          {n.occurrences}×
                        </span>
                      )}
                      {n.mailedAt && (
                        <span className="text-[10px] text-gray-400 bg-white border border-[#E5E7EB] px-2 py-0.5 rounded-full">
                          ✉ envoyé
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{n.message}</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {when(n.lastSeenAt)}
                      {n.accountName && ` · ${n.accountName}`}
                      {n.agentName && ` · ${n.agentName}`}
                    </p>
                  </div>

                  <svg className={clsx('w-4 h-4 text-gray-400 transition-transform flex-shrink-0 mt-1', isOpen && 'rotate-180')}
                       fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="border-t border-[#E5E7EB] px-4 sm:px-5 py-4 space-y-3 bg-[#f8f9fc]">
                    {n.cause && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Cause probable</p>
                        <p className="text-sm text-[#0d0d12] leading-relaxed">{n.cause}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Message d&apos;erreur</p>
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-white border border-[#E5E7EB] rounded-lg p-3 max-h-48 overflow-y-auto">
                        {n.message}
                      </pre>
                    </div>
                    {n.context && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Contexte</p>
                        <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-white border border-[#E5E7EB] rounded-lg p-3 max-h-64 overflow-y-auto">
                          {n.context}
                        </pre>
                      </div>
                    )}
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        onClick={() => { navigator.clipboard.writeText(`${n.title}\n\n${n.message}${n.context ? `\n\n${n.context}` : ''}`); toast.success('Copié') }}
                        className="text-xs text-gray-500 hover:text-[#0d0d12] border border-[#E5E7EB] bg-white rounded-lg px-3 py-1.5"
                      >
                        Copier
                      </button>
                      <button onClick={() => remove(n.id)} className="text-xs text-gray-400 hover:text-red-500">
                        Supprimer
                      </button>
                      <span className="text-[11px] text-gray-400 ml-auto">
                        Première occurrence : {new Date(n.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {items.length > 0 && (
        <p className="text-[11px] text-gray-400 text-center">
          Les jetons d&apos;accès et mots de passe sont masqués avant enregistrement. Purge automatique après 90 jours.
        </p>
      )}
    </div>
  )
}
