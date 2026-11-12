'use client'
import { useEffect, useState } from 'react'
import { EUROS_POUR_MILLE_PERSONNES } from '@/lib/veille/adLibrary'
import { constatsComparaison, ligneComparaison, rapportMarque, type LigneComparaison } from '@/lib/veille/rapport'
import type { PubVeille } from './CartePub'
import { compact } from './FichePub'

/**
 * Plusieurs marques côte à côte : les chiffres de leurs rapports Espion, et
 * les écarts nets mis en phrases.
 */

const CRITERES: { cle: keyof LigneComparaison; libelle: string; aide: string; format: (v: number) => string }[] = [
  { cle: 'pubsActives', libelle: 'Pubs actives', aide: 'Pubs actives connues au dernier scan.', format: (v) => String(v) },
  { cle: 'budgetMensuel', libelle: 'Budget mensuel estimé', aide: 'Estimation à partir de la couverture UE publiée par Meta. Ce n’est pas un chiffre Meta.', format: (v) => `≈ ${compact(v)} €` },
  { cle: 'lancees30j', libelle: 'Créas lancées sur 30 j', aide: 'Le rythme de test.', format: (v) => String(v) },
  { cle: 'installees', libelle: 'Pubs installées (+30 j)', aide: 'Part des pubs actives diffusées depuis plus de 30 jours : ce que la marque laisse tourner.', format: (v) => `${v} %` },
  { cle: 'video', libelle: 'Part de vidéo', aide: 'Part des pubs au format vidéo.', format: (v) => `${v} %` },
  { cle: 'offre', libelle: 'Pubs avec une offre', aide: 'Réduction, remise, code ou promotion.', format: (v) => `${v} %` },
  { cle: 'feminin', libelle: 'Audience féminine', aide: 'Part des femmes dans la couverture UE publiée par Meta.', format: (v) => `${v} %` },
]

export function ComparaisonMarques({ marques, ouvrir, retour }: {
  marques: { id: string; nom: string }[]
  ouvrir: (m: { id: string; nom: string }) => void
  retour: () => void
}) {
  const [lignes, setLignes] = useState<LigneComparaison[] | null>(null)

  useEffect(() => {
    setLignes(null)
    Promise.all(
      marques.map(async (m) => {
        const d = await fetch(`/api/veille/pubs?marque=${m.id}&statut=active&n=600`).then((r) => (r.ok ? r.json() : null))
        const pubs: (PubVeille & { derniereVue?: string })[] = d?.pubs ?? []
        const derniere = pubs.map((p) => p.derniereVue ?? '').sort().pop() || null
        return ligneComparaison(m.nom, rapportMarque(pubs, EUROS_POUR_MILLE_PERSONNES), derniere)
      }),
    ).then(setLignes)
  }, [marques])

  if (!lignes) return <div className="card text-center py-16 text-gray-400 text-sm">Mise en regard de {marques.length} marques…</div>

  const constats = constatsComparaison(lignes)
  const dates = lignes.map((l) => (l.derniereVue ? Date.parse(l.derniereVue) : null)).filter((d): d is number => d !== null)
  const ecart = dates.length > 1 ? Math.round((Math.max(...dates) - Math.min(...dates)) / 86_400_000) : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-[#0d0d12]">Comparaison · {lignes.map((l) => l.nom).join(' · ')}</h2>
        <button type="button" onClick={retour} className="btn-secondary">Retour</button>
      </div>

      {ecart > 7 && (
        <p className="card text-sm text-amber-700">
          {ecart} jours séparent le scan le plus ancien du plus récent : relancez les plus anciens pour comparer à date égale.
        </p>
      )}

      {constats.length > 0 && (
        <section className="card space-y-2 bg-[#f0f0ff]">
          <h3 className="font-semibold text-[#0d0d12]">À retenir</h3>
          <ul className="space-y-1.5 text-sm text-gray-700 list-disc pl-5">
            {constats.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </section>
      )}

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E7EB]">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Critère</th>
              {marques.map((m) => (
                <th key={m.id} className="px-4 py-3 text-left">
                  <button type="button" onClick={() => ouvrir(m)} className="font-semibold text-[#0d0d12] hover:text-[#3434ef]" title={`Ouvrir le rapport de ${m.nom}`}>
                    {m.nom} →
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CRITERES.map((c) => {
              const valeurs = lignes.map((l) => l[c.cle] as number | null)
              const max = Math.max(0, ...valeurs.filter((v): v is number => typeof v === 'number'))
              return (
                <tr key={c.cle} className="border-b border-[#F3F4F6] last:border-0">
                  <td className="px-4 py-3 align-top">
                    <p className="text-[#0d0d12]">{c.libelle}</p>
                    <p className="text-xs text-gray-400 max-w-xs">{c.aide}</p>
                  </td>
                  {valeurs.map((v, i) => (
                    <td key={i} className="px-4 py-3 align-top min-w-[150px]">
                      {v === null ? (
                        <span className="text-xs text-gray-400">{c.cle === 'budgetMensuel' ? 'Non calculable' : 'Inconnue'}</span>
                      ) : (
                        <div className="space-y-1">
                          <p className={v === max && max > 0 ? 'font-semibold text-[#3434ef]' : 'text-[#0d0d12]'}>{c.format(v)}</p>
                          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full bg-[#3434ef]" style={{ width: `${max ? (100 * v) / max : 0}%` }} />
                          </div>
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        Calculé sur les pubs actives en base. Le budget et l’audience n’existent que pour les pubs dont la couverture UE a été lue.
      </p>
    </div>
  )
}
