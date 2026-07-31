import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAdAccounts } from '@/lib/meta'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const accounts = await getAdAccounts(session.accessToken as string)

    // Try to upsert + read from DB; fall back to raw Meta accounts if DB fails
    try {
      await Promise.all(
        accounts.map((acc: Record<string, string>) =>
          prisma.adAccount.upsert({
            where: { userId_metaAccountId: { userId: session.user!.id!, metaAccountId: acc.id } },
            update: { name: acc.name, currency: acc.currency, timezone: acc.timezone_name },
            create: {
              metaAccountId: acc.id,
              name: acc.name,
              currency: acc.currency,
              timezone: acc.timezone_name,
              userId: session.user!.id!,
            },
          })
        )
      )

      const dbAccounts = await prisma.adAccount.findMany({
        where: { userId: session.user.id },
        include: { brandSettings: true },
        orderBy: { name: 'asc' },
      })

      return NextResponse.json({ accounts: dbAccounts })
    } catch (dbErr) {
      console.error('DB error — falling back to Meta accounts:', dbErr)
      // Return Meta accounts directly so the UI never shows "Aucun compte trouvé"
      const fallback = accounts.map((acc: Record<string, string>) => ({
        id: acc.id,
        metaAccountId: acc.id,
        name: acc.name,
        currency: acc.currency,
        timezone: acc.timezone_name,
      }))
      return NextResponse.json({ accounts: fallback })
    }
  } catch (err) {
    console.error('Meta accounts error:', err)
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
  }
}
