import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { Sidebar } from '@/components/layout/Sidebar'
import { AccountSelector } from '@/components/layout/AccountSelector'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fc]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-[#E5E7EB] flex items-center justify-between px-6 flex-shrink-0">
          <AccountSelector />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" title="IA connectée" />
            <span className="text-xs text-gray-400 font-medium">IA connectée</span>
          </div>
        </header>
        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
