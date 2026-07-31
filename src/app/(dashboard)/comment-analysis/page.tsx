export default function CommentAnalysisPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="page-title">Analyse des commentaires</h1>
        <p className="page-subtitle mt-0.5">Analysez le sentiment et les thèmes des commentaires de vos publicités</p>
      </div>
      <div className="card text-center py-16">
        <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-[#3434ef]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h3 className="font-semibold text-[#0d0d12] mb-1">Module en développement</h3>
        <p className="text-sm text-gray-400">L&apos;analyse IA des commentaires sera disponible prochainement.</p>
      </div>
    </div>
  )
}
