'use client'
import { useState, useCallback, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'

interface UploadedFile {
  file: File
  preview: string
  type: 'image' | 'video'
}

interface AdSet {
  id: string
  name: string
}

export default function CreativeStudioPage() {
  const { selectedAccount } = useStore()
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [adsets, setAdsets] = useState<AdSet[]>([])
  const [selectedAdset, setSelectedAdset] = useState('')
  const [adName, setAdName] = useState('')
  const [headline, setHeadline] = useState('')
  const [primaryText, setPrimaryText] = useState('')
  const [cta, setCta] = useState('LEARN_MORE')
  const [destinationUrl, setDestinationUrl] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')

  useEffect(() => {
    if (!selectedAccount) return
    fetch(`/api/meta/insights?accountId=${selectedAccount.metaAccountId || selectedAccount.id}&type=adsets`)
      .then((r) => r.json())
      .then((data: AdSet[]) => setAdsets(data || []))
      .catch(() => {})
  }, [selectedAccount])

  const onDrop = useCallback((accepted: File[]) => {
    const newFiles = accepted.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
    }))
    setFiles((prev) => [...prev, ...newFiles])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
      'video/*': ['.mp4', '.mov', '.avi', '.m4v'],
    },
    maxSize: 500 * 1024 * 1024,
  })

  async function publish() {
    if (!selectedAccount || files.length === 0 || !selectedAdset || !adName) {
      toast.error('Remplissez tous les champs requis')
      return
    }
    setPublishing(true)
    try {
      const file = files[0]
      const formData = new FormData()
      formData.append('file', file.file)
      formData.append('accountId', selectedAccount.metaAccountId || selectedAccount.id)
      formData.append('adsetId', selectedAdset)
      formData.append('adName', adName)
      formData.append('headline', headline)
      formData.append('primaryText', primaryText)
      formData.append('cta', cta)
      formData.append('destinationUrl', destinationUrl)
      formData.append('type', file.type)

      setUploadProgress('Upload du fichier en cours…')
      const res = await fetch('/api/meta/creative', { method: 'POST', body: formData })
      const data = await res.json()

      if (data.error) throw new Error(data.error)
      toast.success('Publicité publiée avec succès ! ✓')
      setFiles([])
      setAdName('')
      setHeadline('')
      setPrimaryText('')
    } catch (err) {
      toast.error(`Erreur : ${err}`)
    }
    setPublishing(false)
    setUploadProgress('')
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="page-title">Creative Studio</h1>
        <p className="page-subtitle mt-0.5">Uploadez vos créas et publiez directement dans Meta Ads — sans passer par l&apos;Ads Manager</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload zone */}
        <div className="space-y-4">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              isDragActive
                ? 'border-brand-500 bg-brand-500/10'
                : 'border-gray-700 hover:border-gray-600 bg-gray-800/30'
            }`}
          >
            <input {...getInputProps()} />
            <div className="text-4xl mb-3">🎨</div>
            <p className="text-gray-300 font-medium">Glissez vos créas ici</p>
            <p className="text-gray-500 text-sm mt-1">Images (JPG, PNG) ou Vidéos (MP4, MOV) — Max 500MB</p>
            <button className="btn-secondary mt-4 text-sm">Parcourir</button>
          </div>

          {/* Preview */}
          {files.length > 0 && (
            <div className="space-y-3">
              {files.map((f, i) => (
                <div key={i} className="card flex items-center gap-3">
                  {f.type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.preview} alt="preview" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
                  ) : (
                    <div className="w-16 h-16 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-2xl">🎬</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate">{f.file.name}</p>
                    <p className="text-xs text-gray-500">
                      {f.type === 'video' ? 'Vidéo' : 'Image'} — {(f.file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  <button
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="text-gray-600 hover:text-red-400 transition-colors text-lg"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div className="card space-y-4">
            <h3 className="font-semibold text-white">Configuration de la publicité</h3>

            <div>
              <label className="label">Ad Set de destination *</label>
              <select
                value={selectedAdset}
                onChange={(e) => setSelectedAdset(e.target.value)}
                className="select"
              >
                <option value="">Sélectionner un ad set…</option>
                {adsets.map((a: AdSet) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Nom de la publicité *</label>
              <input
                type="text"
                value={adName}
                onChange={(e) => setAdName(e.target.value)}
                placeholder="ex : Vidéo_Hook_Pain_V1"
                className="input"
              />
            </div>

            <div>
              <label className="label">Texte principal</label>
              <textarea
                rows={3}
                value={primaryText}
                onChange={(e) => setPrimaryText(e.target.value)}
                placeholder="Votre accroche principale…"
                className="input resize-none"
              />
            </div>

            <div>
              <label className="label">Titre (headline)</label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="ex : Découvrez notre offre"
                className="input"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Call to action</label>
                <select
                  value={cta}
                  onChange={(e) => setCta(e.target.value)}
                  className="select"
                >
                  {['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'GET_QUOTE', 'CONTACT_US', 'BOOK_NOW', 'DOWNLOAD', 'WATCH_MORE'].map((c) => (
                    <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">URL de destination *</label>
                <input
                  type="url"
                  value={destinationUrl}
                  onChange={(e) => setDestinationUrl(e.target.value)}
                  placeholder="https://…"
                  className="input"
                />
              </div>
            </div>
          </div>

          <button
            onClick={publish}
            disabled={publishing || !selectedAccount || files.length === 0}
            className="w-full btn-primary flex items-center justify-center gap-2 py-3"
          >
            {publishing ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                {uploadProgress || 'Publication en cours…'}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Publier dans Meta Ads
              </>
            )}
          </button>

          {!selectedAccount && (
            <p className="text-xs text-gray-500 text-center">Sélectionnez un compte publicitaire pour publier.</p>
          )}
        </div>
      </div>
    </div>
  )
}
