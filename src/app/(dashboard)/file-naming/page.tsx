'use client'
import { useState } from 'react'

interface NomenclatureConfig {
  id: string
  name: string
  pattern: string
  example: string
  separator: string
  positions: { field: string; label: string }[]
}

const DEFAULT_PATTERNS: NomenclatureConfig[] = [
  {
    id: 'standard',
    name: 'Standard',
    pattern: '{concept}_{iteration}_{format}',
    example: 'HeroVideo_H1_9x16.mp4',
    separator: '_',
    positions: [
      { field: 'concept', label: 'Concept' },
      { field: 'iteration', label: 'Itération' },
      { field: 'format', label: 'Format' },
    ],
  },
  {
    id: 'extended',
    name: 'Étendu',
    pattern: '{brand}_{concept}_{iteration}_{format}_{version}',
    example: 'Nike_HeroVideo_H1_9x16_v2.mp4',
    separator: '_',
    positions: [
      { field: 'brand', label: 'Brand' },
      { field: 'concept', label: 'Concept' },
      { field: 'iteration', label: 'Itération' },
      { field: 'format', label: 'Format' },
      { field: 'version', label: 'Version' },
    ],
  },
]

export default function FileNamingPage() {
  const [selected, setSelected] = useState<string>('standard')
  const [separator, setSeparator] = useState('_')
  const [customExample, setCustomExample] = useState('')
  const [saved, setSaved] = useState(false)

  const current = DEFAULT_PATTERNS.find(p => p.id === selected)

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="page-title">Patterns</h1>
        <p className="page-subtitle mt-0.5">Configurez vos conventions de nommage de fichiers créatifs</p>
      </div>

      {/* Pattern selector */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-[#0d0d12]">Pattern de nommage</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DEFAULT_PATTERNS.map(p => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={`text-left p-4 rounded-xl border transition-all ${
                selected === p.id
                  ? 'border-[#3434ef] bg-[#f0f0ff]'
                  : 'border-[#E5E7EB] hover:border-gray-300'
              }`}
            >
              <p className="text-sm font-medium text-[#0d0d12]">{p.name}</p>
              <p className="text-xs text-gray-400 mt-1 font-mono">{p.pattern}</p>
              <p className="text-xs text-gray-500 mt-1.5">ex: {p.example}</p>
            </button>
          ))}
        </div>

        {/* Positions */}
        {current && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Positions des champs</h3>
            <div className="space-y-2">
              {current.positions.map((pos, i) => (
                <div key={pos.field} className="flex items-center gap-3 p-3 bg-[#f8f9fc] rounded-lg">
                  <span className="w-6 h-6 bg-[#3434ef] text-white text-xs rounded-full flex items-center justify-center font-semibold">{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#0d0d12]">{pos.label}</p>
                    <p className="text-xs text-gray-400 font-mono">{`{${pos.field}}`}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Separator */}
        <div>
          <label className="label">Séparateur</label>
          <div className="flex gap-2">
            {['_', '-', '.', '/'].map(s => (
              <button
                key={s}
                onClick={() => setSeparator(s)}
                className={`px-4 py-2 rounded-lg border text-sm font-mono transition-all ${
                  separator === s ? 'border-[#3434ef] bg-[#f0f0ff] text-[#3434ef]' : 'border-[#E5E7EB] text-gray-600 hover:border-gray-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Test zone */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-[#0d0d12]">Tester un nom de fichier</h2>
        <input
          className="input"
          placeholder="ex: HeroVideo_H1_9x16.mp4"
          value={customExample}
          onChange={e => setCustomExample(e.target.value)}
        />
        {customExample && current && (
          <div className="p-3 bg-[#f8f9fc] rounded-lg">
            <p className="text-xs text-gray-400 mb-2">Analyse IA du fichier :</p>
            <div className="flex flex-wrap gap-2">
              {customExample.replace(/\.[^/.]+$/, '').split(separator).map((part, i) => (
                <span key={i} className="flex items-center gap-1.5 text-xs bg-white border border-[#E5E7EB] rounded-full px-3 py-1">
                  <span className="text-gray-400">{current.positions[i]?.label || `Champ ${i + 1}`}</span>
                  <span className="font-semibold text-[#0d0d12]">{part}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="card border-l-4 border-l-[#3434ef] bg-[#f0f0ff]">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-[#3434ef] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-[#0d0d12]">Nomenclature IA</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Lors de l&apos;upload, l&apos;IA analysera automatiquement vos fichiers et détectera le pattern concept / itération / format. La config définie ici servira de référence pour l&apos;auto-detection.
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={handleSave} className={`btn-primary ${saved ? 'bg-green-600 hover:bg-green-600' : ''}`}>
          {saved ? '✓ Enregistré' : 'Enregistrer la config'}
        </button>
        <button className="btn-secondary">Réinitialiser</button>
      </div>
    </div>
  )
}
