import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from 'react-hot-toast'
import { SpeedInsights } from '@vercel/speed-insights/next'

export const metadata: Metadata = {
  title: 'Metanalyzer — Meta Ads Intelligence',
  description: 'Analysez et pilotez vos campagnes Meta Ads avec l\'IA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
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
        <SpeedInsights />
      </body>
    </html>
  )
}
