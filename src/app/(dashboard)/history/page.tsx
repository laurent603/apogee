'use client'

export default function HistoryPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="page-title">Historique des lancements</h1>
        <p className="page-subtitle mt-0.5">Tous vos lancements de campagnes Meta Ads</p>
      </div>

      <div className="card text-center py-20">
        <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-[#3434ef]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-[#0d0d12] mb-2">Pas encore de lancement</h2>
        <p className="text-sm text-gray-400 mb-5 max-w-sm mx-auto">
          L&apos;historique de vos lancements de campagnes Meta Ads apparaîtra ici après votre premier upload.
        </p>
        <a href="/upload" className="btn-primary inline-block">
          Lancer une première campagne
        </a>
      </div>
    </div>
  )
}
