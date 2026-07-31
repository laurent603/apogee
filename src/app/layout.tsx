import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'APOGEE — Meta Ads Intelligence',
  description: 'Pilotez vos campagnes Meta Ads avec l\'IA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body>
        <Providers>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: { background: '#1f2937', color: '#f9fafb', border: '1px solid #374151' },
            }}
          />
        </Providers>
      </body>
    </html>
  )
}
