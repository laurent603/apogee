import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  let userId = (session?.user as { id?: string })?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (/^\d+$/.test(userId)) {
    try {
      const user = await prisma.user.findUnique({ where: { facebookId: userId } })
      if (user) userId = user.id
    } catch { /* keep existing */ }
  }

  const metaAccountId = req.nextUrl.searchParams.get('metaAccountId')

  const launches = await prisma.launchHistory.findMany({
    where: {
      userId,
      ...(metaAccountId ? { metaAccountId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json(launches)
}
