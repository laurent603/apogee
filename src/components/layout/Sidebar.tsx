'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import Image from 'next/image'
import { clsx } from 'clsx'

type NavItem = { href: string; label: string; icon: React.ReactNode }
type Section = { titre: string; items: NavItem[] }

/**
 * Le menu, en quatre sections.
 *
 * Une liste plate de dix entrées ne dit pas à quoi sert l'application. Les
 * sections nomment les quatre métiers qu'elle couvre : piloter les comptes,
 * lancer des campagnes, produire de l'analyse, régler le contexte.
 *
 * Sept pages vivaient dans le code sans qu'aucun lien n'y mène. Cinq ont été
 * supprimées — elles refaisaient ce que Cockpit, Pilotage et la galerie Créas
 * font désormais sur données réelles — et les deux qui n'avaient pas
 * d'équivalent, l'audit technique et la convention de nommage, ont retrouvé
 * leur place ici.
 */
const sections: Section[] = [
  {
    titre: 'Piloter',
    items: [
      { href: '/cockpit', label: 'Dashboard', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ) },
      { href: '/pilotage', label: 'Media buying', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M3 6h18M3 18h18" />
      </svg>
    ) },
    ],
  },
  {
    titre: 'Lancer',
    items: [
      { href: '/upload', label: 'Upload', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ) },
      { href: '/history', label: 'Historique', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ) },
      { href: '/file-naming', label: 'Patterns', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 10V5a2 2 0 012-2z" />
      </svg>
    ) },
    ],
  },
  {
    titre: 'Analyser',
    items: [
      { href: '/autopilot', label: 'Autopilot Agent IA', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-1" />
      </svg>
    ) },
      { href: '/creative-strategist', label: 'Creative Strategist', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ) },
      { href: '/comment-analysis', label: 'Analyse commentaires', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ) },
    ],
  },
  {
    titre: 'Réglages',
    items: [
      { href: '/brand-settings', label: 'Brand Settings', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ) },
      { href: '/audit', label: 'Audit technique', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    ) },
      { href: '/notifications', label: 'Notifications', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ) },
    ],
  },
]

/**
 * Le menu, éventuellement réduit.
 *
 * Réduit, il ne garde que les icônes : les tableaux de Media buying tiennent
 * douze colonnes, et deux cents pixels rendus à la largeur utile changent ce
 * qu'on lit sans faire défiler.
 *
 * La réduction ne vaut qu'à partir de `md`. En dessous, le menu est un tiroir
 * qui se referme entièrement — le réduire n'aurait aucun sens.
 */
export function Sidebar({ open = false, onNavigate, reduit = false, anime = false }: {
  open?: boolean; onNavigate?: () => void; reduit?: boolean
  /** Anime le changement de largeur — faux au premier rendu, pour que le menu
   *  apparaisse déjà réduit au lieu de se réduire à chaque chargement. */
  anime?: boolean
}) {
  const pathname = usePathname()
  const { data: session } = useSession()

  return (
    <aside
      className={clsx(
        'fixed inset-y-0 left-0 z-40 w-72 flex flex-col h-screen flex-shrink-0 transform transition-transform duration-200 ease-in-out',
        'md:static md:z-auto md:translate-x-0',
        anime && 'md:transition-[width,transform] md:duration-200',
        reduit ? 'md:w-16' : 'md:w-64',
        open ? 'translate-x-0' : '-translate-x-full'
      )}
      style={{ background: '#3434ef' }}
    >
      {/* Logo */}
      <div className={clsx('py-5 flex items-center justify-between', reduit ? 'md:px-4 px-5' : 'px-5')}
        style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className={clsx('font-bold text-white text-base tracking-tight', reduit && 'md:hidden')}>Leadscore</span>
        </div>
        <button
          onClick={onNavigate}
          className="md:hidden p-1.5 -mr-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10"
          aria-label="Fermer le menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className={clsx('flex-1 py-4 overflow-y-auto', reduit ? 'md:px-2 px-3' : 'px-3')}>
        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.titre}>
              {/* Réduit, le titre laisse place à un filet : le regroupement
                  reste lisible sans occuper une ligne de texte. */}
              <p className={clsx('px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-white/40',
                reduit && 'md:hidden')}>
                {section.titre}
              </p>
              {reduit && <div className="hidden md:block mx-3 mb-2 h-px bg-white/15" />}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      title={reduit ? item.label : undefined}
                      className={clsx(
                        'flex items-center gap-3 py-2 rounded-lg text-sm font-medium transition-all',
                        reduit ? 'px-3 md:px-0 md:justify-center' : 'px-3',
                        active ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                      )}
                    >
                      <span className={clsx('flex-shrink-0 transition-opacity', active ? 'opacity-100' : 'opacity-60')}>
                        {item.icon}
                      </span>
                      <span className={clsx('truncate', reduit && 'md:hidden')}>{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* User */}
      <div className={clsx('py-4', reduit ? 'md:px-2 px-3' : 'px-3')} style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
        <div className={clsx('flex items-center gap-3 py-2', reduit ? 'px-2 md:px-0 md:flex-col md:gap-2' : 'px-2')}>
          {session?.user?.image && (
            <Image
              src={session.user.image}
              alt="avatar"
              width={32}
              height={32}
              title={reduit ? session.user.name ?? undefined : undefined}
              className="rounded-full flex-shrink-0 ring-2 ring-white/20"
            />
          )}
          <div className={clsx('flex-1 min-w-0', reduit && 'md:hidden')}>
            <p className="text-sm font-medium text-white truncate">{session?.user?.name}</p>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-xs text-white/50 hover:text-white/80 transition-colors"
            >
              Déconnexion
            </button>
          </div>
          {/* Réduit, la déconnexion reste atteignable — sans elle, il faudrait
              rouvrir le menu pour sortir. */}
          {reduit && (
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              title="Déconnexion"
              aria-label="Déconnexion"
              className="hidden md:flex p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
