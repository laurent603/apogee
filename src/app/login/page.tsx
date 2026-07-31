'use client'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function LoginPage() {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated') router.push('/dashboard')
  }, [status, router])

  return (
    <div className="min-h-screen bg-[#f8f9fc] flex">
      {/* Left — brand panel */}
      <div className="hidden lg:flex w-2/5 flex-col items-center justify-center p-12" style={{ background: '#3434ef' }}>
        <div className="max-w-xs text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/15 mb-6">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-3">Metanalyzer</h1>
          <p className="text-white/70 text-sm leading-relaxed">
            Analysez vos campagnes Meta Ads en profondeur et pilotez votre stratégie avec l&apos;intelligence artificielle.
          </p>
          <div className="mt-10 space-y-3">
            {[
              { icon: '📊', label: 'Analyse IA des performances' },
              { icon: '🚀', label: 'Upload & lancement de créas' },
              { icon: '🤖', label: 'Agents IA autonomes' },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-3 text-left bg-white/10 rounded-xl px-4 py-3">
                <span className="text-xl">{f.icon}</span>
                <span className="text-white/90 text-sm font-medium">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#3434ef] mb-3">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[#0d0d12]">Metanalyzer</h1>
          </div>

          <div className="card">
            <h2 className="text-xl font-bold text-[#0d0d12] mb-1">Connexion</h2>
            <p className="text-gray-500 text-sm mb-6">
              Connectez-vous avec Facebook pour accéder à vos comptes Meta Ads.
            </p>

            <button
              onClick={() => signIn('facebook', { callbackUrl: '/dashboard' })}
              className="w-full flex items-center justify-center gap-3 bg-[#1877F2] hover:bg-[#166FE5] text-white font-semibold py-3 px-4 rounded-xl transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Continuer avec Facebook
            </button>

            <p className="text-center text-xs text-gray-400 mt-4">
              En vous connectant, vous autorisez Metanalyzer à lire et gérer vos comptes publicitaires Meta.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
