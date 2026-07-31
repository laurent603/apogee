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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-full max-w-md px-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">APOGEE</h1>
          <p className="text-gray-400 mt-2 text-sm">Intelligence Meta Ads pour votre agence</p>
        </div>

        {/* Card */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-1">Connexion</h2>
          <p className="text-gray-400 text-sm mb-6">
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

          <p className="text-center text-xs text-gray-500 mt-4">
            En vous connectant, vous autorisez APOGEE à lire et gérer vos comptes publicitaires Meta.
          </p>
        </div>

        {/* Features */}
        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          {[
            { icon: '📊', label: 'Analyse IA' },
            { icon: '🤖', label: 'Autopilote' },
            { icon: '🚀', label: 'Publication' },
          ].map((f) => (
            <div key={f.label} className="bg-gray-900/50 rounded-xl p-3">
              <div className="text-2xl mb-1">{f.icon}</div>
              <div className="text-xs text-gray-400 font-medium">{f.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
