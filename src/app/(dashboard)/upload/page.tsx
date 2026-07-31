'use client'
import { useState, useRef, useCallback } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

const STEPS = [
  { id: 1, label: 'Médias', desc: 'Importez vos créatifs' },
  { id: 2, label: 'Nomenclature', desc: 'Validez & groupez' },
  { id: 3, label: 'Configuration', desc: 'Paramètres de test' },
  { id: 4, label: 'Aperçu', desc: 'Vérifiez avant envoi' },
  { id: 5, label: 'Lancement', desc: 'Publication Meta' },
]

interface UploadedFile {
  id: string
  file: File
  preview: string
  type: 'image' | 'video'
  width?: number
  height?: number
  ratio?: string
  group?: string
}

function detectRatio(w: number, h: number): string {
  const r = w / h
  if (Math.abs(r - 1) < 0.05) return '1:1'
  if (Math.abs(r - 9 / 16) < 0.05) return '9:16'
  if (Math.abs(r - 16 / 9) < 0.05) return '16:9'
  if (Math.abs(r - 4 / 5) < 0.05) return '4:5'
  if (Math.abs(r - 1.91) < 0.05) return '1.91:1'
  return `${w}×${h}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export default function UploadPage() {
  const [step, setStep] = useState(1)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [launched, setLaunched] = useState(false)
  const [journal, setJournal] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList)
    const newFiles: UploadedFile[] = []

    for (const f of arr) {
      if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) continue
      const isVideo = f.type.startsWith('video/')
      const preview = URL.createObjectURL(f)
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`

      if (!isVideo) {
        await new Promise<void>((resolve) => {
          const img = new Image()
          img.onload = () => {
            const ratio = detectRatio(img.naturalWidth, img.naturalHeight)
            newFiles.push({ id, file: f, preview, type: 'image', width: img.naturalWidth, height: img.naturalHeight, ratio })
            resolve()
          }
          img.src = preview
        })
      } else {
        newFiles.push({ id, file: f, preview, type: 'video' })
      }
    }

    setFiles((prev) => [...prev, ...newFiles])
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    processFiles(e.dataTransfer.files)
  }, [processFiles])

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const groupFiles = () => {
    setFiles((prev) =>
      prev.map((f) => ({
        ...f,
        group: f.ratio === '1:1' || f.ratio === '9:16' ? 'Test A — ' + f.ratio : f.group,
      }))
    )
  }

  const simulateLaunch = async () => {
    setLaunching(true)
    setJournal([])
    const steps = [
      '✅ Connexion à Meta Ads API...',
      '✅ Upload des médias...',
      '✅ Création des ad creatives...',
      '✅ Création des ad sets...',
      '✅ Création des publicités...',
      '🎉 Campagne lancée avec succès !',
    ]
    for (const s of steps) {
      await new Promise((r) => setTimeout(r, 900))
      setJournal((prev) => [...prev, s])
    }
    setLaunching(false)
    setLaunched(true)
    toast.success('Campagne lancée !')
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title">Upload de créatifs</h1>
        <p className="page-subtitle mt-0.5">Importez, organisez et lancez vos créatifs Meta Ads en 5 étapes</p>
      </div>

      {/* Step bar */}
      <div className="card p-4">
        <div className="flex items-center">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1">
              <button
                onClick={() => step > s.id && setStep(s.id)}
                className={clsx('flex items-center gap-2.5 min-w-0', step > s.id && 'cursor-pointer')}
              >
                <div className={clsx('step-dot flex-shrink-0', {
                  done: step > s.id,
                  active: step === s.id,
                  pending: step < s.id,
                })}>
                  {step > s.id ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : s.id}
                </div>
                <div className="hidden sm:block text-left min-w-0">
                  <div className={clsx('text-xs font-semibold truncate', step === s.id ? 'text-[#3434ef]' : step > s.id ? 'text-[#0d0d12]' : 'text-gray-400')}>
                    {s.label}
                  </div>
                  <div className="text-xs text-gray-400 truncate">{s.desc}</div>
                </div>
              </button>
              {i < STEPS.length - 1 && (
                <div className={clsx('flex-1 h-0.5 mx-3', step > s.id ? 'bg-[#3434ef]' : 'bg-[#E5E7EB]')} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1 — Import */}
      {step === 1 && (
        <div className="space-y-4">
          <div
            className={clsx('drop-zone', dragging && 'active')}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => e.target.files && processFiles(e.target.files)}
            />
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-[#3434ef]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-[#0d0d12]">Glissez-déposez vos médias ici</p>
                <p className="text-sm text-gray-400 mt-0.5">ou cliquez pour parcourir — Images & vidéos acceptées</p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                {['JPG', 'PNG', 'MP4', 'MOV', 'GIF'].map((f) => (
                  <span key={f} className="badge-gray">{f}</span>
                ))}
              </div>
            </div>
          </div>

          {files.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {files.map((f) => (
                  <div key={f.id} className="card p-2 relative group">
                    <button
                      onClick={() => removeFile(f.id)}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs z-10"
                    >×</button>
                    {f.type === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.preview} alt={f.file.name} className="w-full h-28 object-cover rounded-lg" />
                    ) : (
                      <div className="w-full h-28 bg-gray-100 rounded-lg flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                        </svg>
                      </div>
                    )}
                    <div className="mt-1.5 px-0.5">
                      <p className="text-xs font-medium text-[#0d0d12] truncate">{f.file.name}</p>
                      <p className="text-xs text-gray-400">
                        {formatSize(f.file.size)}
                        {f.ratio && ` · ${f.ratio}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button onClick={() => setStep(2)} className="btn-primary">
                  Continuer — Nomenclature →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 2 — Nomenclature */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[#0d0d12]">Validation de la nomenclature</h3>
              <button onClick={groupFiles} className="btn-secondary text-xs">
                Grouper automatiquement par ratio
              </button>
            </div>
            <div className="space-y-2">
              {files.map((f) => (
                <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#f8f9fc] border border-[#E5E7EB]">
                  {f.type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.preview} alt="" className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 bg-gray-200 rounded-md flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0d0d12] truncate">{f.file.name}</p>
                    <p className="text-xs text-gray-400">{formatSize(f.file.size)} {f.ratio && `· ${f.ratio}`}</p>
                  </div>
                  {f.ratio && (
                    <span className={clsx('badge-blue', f.ratio === '9:16' && 'bg-purple-50 text-purple-700 border-purple-200')}>
                      {f.ratio}
                    </span>
                  )}
                  <input
                    type="text"
                    value={f.group || ''}
                    onChange={(e) => setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, group: e.target.value } : x))}
                    placeholder="Groupe (ex: Test A)"
                    className="input w-32 py-1 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="btn-secondary">← Retour</button>
            <button onClick={() => setStep(3)} className="btn-primary">Continuer — Configuration →</button>
          </div>
        </div>
      )}

      {/* Step 3 — Configuration */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <h3 className="font-semibold text-[#0d0d12]">Configuration du test</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Nom de la campagne</label>
                <input type="text" className="input" placeholder="Ex: TEST — Créatifs Juillet 2025" />
              </div>
              <div>
                <label className="label">Objectif</label>
                <select className="select">
                  <option value="OUTCOME_SALES">Ventes</option>
                  <option value="OUTCOME_LEADS">Leads</option>
                  <option value="OUTCOME_TRAFFIC">Trafic</option>
                  <option value="OUTCOME_AWARENESS">Notoriété</option>
                </select>
              </div>
              <div>
                <label className="label">Budget quotidien (€)</label>
                <input type="number" className="input" placeholder="50" min="1" />
              </div>
              <div>
                <label className="label">Structure de test</label>
                <select className="select">
                  <option value="1adset">1 Ad Set par groupe créatif</option>
                  <option value="1campaign">1 Campagne — Ad Sets multiples</option>
                  <option value="cbo">CBO — Budget campagne</option>
                </select>
              </div>
              <div>
                <label className="label">Date de début</label>
                <input type="date" className="input" />
              </div>
              <div>
                <label className="label">Optimisation</label>
                <select className="select">
                  <option value="OFFSITE_CONVERSIONS">Conversions</option>
                  <option value="LINK_CLICKS">Clics sur le lien</option>
                  <option value="LANDING_PAGE_VIEWS">Vues de la page de destination</option>
                  <option value="REACH">Portée</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">URL de destination</label>
              <input type="url" className="input" placeholder="https://votresite.com/produit" />
            </div>
            <div>
              <label className="label">Pixel Meta ID</label>
              <input type="text" className="input" placeholder="123456789012345" />
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="btn-secondary">← Retour</button>
            <button onClick={() => setStep(4)} className="btn-primary">Continuer — Aperçu →</button>
          </div>
        </div>
      )}

      {/* Step 4 — Aperçu */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-[#0d0d12] mb-4">Récapitulatif avant lancement</h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-[#f8f9fc] rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-[#3434ef]">{files.length}</div>
                <div className="text-xs text-gray-500 mt-0.5">créatifs</div>
              </div>
              <div className="bg-[#f8f9fc] rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-[#3434ef]">
                  {[...new Set(files.map((f) => f.ratio))].length}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">formats</div>
              </div>
              <div className="bg-[#f8f9fc] rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-[#3434ef]">
                  {[...new Set(files.map((f) => f.group).filter(Boolean))].length || 1}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">groupes</div>
              </div>
            </div>

            <div className="space-y-2">
              {files.map((f) => (
                <div key={f.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-[#E5E7EB]">
                  {f.type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.preview} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
                    </div>
                  )}
                  <span className="text-sm text-[#0d0d12] flex-1 truncate">{f.file.name}</span>
                  {f.ratio && <span className="badge-blue">{f.ratio}</span>}
                  {f.group && <span className="badge-gray text-xs">{f.group}</span>}
                  <span className="badge-green">Prêt</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card bg-amber-50 border-amber-200">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-amber-800">Vérification avant lancement</p>
                <p className="text-xs text-amber-700 mt-0.5">Assurez-vous que le pixel Meta est correctement configuré et que l&apos;URL de destination est accessible.</p>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="btn-secondary">← Retour</button>
            <button onClick={() => setStep(5)} className="btn-primary">Lancer la campagne →</button>
          </div>
        </div>
      )}

      {/* Step 5 — Lancement */}
      {step === 5 && (
        <div className="space-y-4">
          {!launched && !launching && (
            <div className="card text-center py-10">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-[#3434ef]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-[#0d0d12] mb-2">Prêt à lancer</h3>
              <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
                Votre campagne avec {files.length} créatif{files.length > 1 ? 's' : ''} va être soumise à Meta Ads. Cette action est irréversible.
              </p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setStep(4)} className="btn-secondary">← Retour</button>
                <button onClick={simulateLaunch} className="btn-primary px-8">
                  🚀 Lancer maintenant
                </button>
              </div>
            </div>
          )}

          {(launching || launched) && (
            <div className="card">
              <h3 className="font-semibold text-[#0d0d12] mb-4">Journal de lancement</h3>
              <div className="space-y-2">
                {journal.map((line, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-[#0d0d12]">
                    <span>{line}</span>
                  </div>
                ))}
                {launching && (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <svg className="animate-spin w-4 h-4 text-[#3434ef]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    En cours…
                  </div>
                )}
              </div>
              {launched && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
                  <p className="text-sm font-semibold text-green-800">🎉 Campagne lancée avec succès !</p>
                  <p className="text-xs text-green-700 mt-0.5">Vos créatifs sont maintenant en cours de révision par Meta.</p>
                  <button
                    onClick={() => { setStep(1); setFiles([]); setLaunched(false); setJournal([]) }}
                    className="btn-secondary mt-3 text-xs"
                  >
                    Nouveau upload
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
