import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'Leadscore — Meta Ads Intelligence',
  description: 'Analysez et pilotez vos campagnes Meta Ads avec l\'IA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/*
          Le thème est posé avant le premier rendu.
          Le lire depuis React le poserait après la peinture : l'écran
          clignoterait en blanc à chaque chargement de page.
        */}
        <script dangerouslySetInnerHTML={{ __html:
          `try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}`
        }} />
      </head>
      <body>
        <Providers>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: { background: '#ffffff', color: '#0d0d12', border: '1px solid #E5E7EB', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' },
            }}
          />
        </Providers>
      </body>
    </html>
  )
}
