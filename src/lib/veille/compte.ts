import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/** Le compte publicitaire, s'il appartient à l'utilisateur connecté ; null sinon. */
export async function compteDe(dbAccountId: unknown) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || typeof dbAccountId !== 'string') return null
  return prisma.adAccount.findFirst({ where: { id: dbAccountId, userId: session.user.id }, select: { id: true, name: true } })
}
