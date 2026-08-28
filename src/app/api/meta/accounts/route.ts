import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAdAccounts } from '@/lib/meta'
import { prisma } from '@/lib/db'

/**
 * Les comptes publicitaires de l'utilisateur.
 *
 * Meta est la source des comptes, la base est la source de leur identité :
 * partout dans l'application, `id` est l'identifiant en base et sert de
 * `dbAccountId`. C'est ce contrat qui compte ici — le rompre ne casse rien
 * visiblement, ça vide juste tous les écrans d'analyse en silence.
 */

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let comptesMeta: Record<string, string>[]
  try {
    const bruts = await getAdAccounts(session.accessToken as string)
    // Les comptes en lecture seule ne servent à rien ici : on ne peut ni
    // lancer ni modifier dessus.
    comptesMeta = bruts.filter((acc: Record<string, string>) => {
      if (acc.account_status && String(acc.account_status) !== '1') return false
      const nom = (acc.name || '').toLowerCase()
      if (nom.includes('read') && (nom.includes('only') || nom.includes('-only'))) return false
      return true
    })
  } catch (err) {
    console.error('Meta accounts error:', err)
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
  }

  /**
   * Les enregistrements se font un par un.
   *
   * Un `Promise.all` faisait tomber la lecture entière dès qu'un seul compte
   * posait problème — l'utilisateur perdait alors ses vingt comptes, et leurs
   * réglages de marque, à cause d'un.
   */
  const enregistrements = await Promise.allSettled(
    comptesMeta.map((acc) =>
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
      }),
    ),
  )
  const echecs = enregistrements.filter((r) => r.status === 'rejected')
  if (echecs.length) {
    console.error(`accounts: ${echecs.length}/${comptesMeta.length} enregistrements en échec`,
      (echecs[0] as PromiseRejectedResult).reason)
  }

  try {
    const enBase = await prisma.adAccount.findMany({
      where: { userId: session.user.id },
      include: { brandSettings: true },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ accounts: enBase })
  } catch (dbErr) {
    console.error('DB indisponible — repli sur les comptes Meta :', dbErr)

    /**
     * Repli : la base est injoignable.
     *
     * On rend quand même les comptes, parce que l'upload et le lancement ne
     * dépendent que de l'identifiant Meta et doivent continuer à fonctionner.
     * Mais `id` ne peut pas porter l'identifiant Meta : il serait pris pour un
     * `dbAccountId`, et chaque écran d'analyse interrogerait la base avec un
     * identifiant qui n'existe pas — sans erreur, sans message, juste vide.
     *
     * `id` est donc laissé vide et le repli est annoncé : l'interface prévient
     * plutôt que de laisser croire à des comptes sans données.
     */
    const repli = comptesMeta.map((acc) => ({
      id: '',
      metaAccountId: acc.id,
      name: acc.name,
      currency: acc.currency,
      timezone: acc.timezone_name,
      sansBase: true,
    }))
    return NextResponse.json({
      accounts: repli,
      degrade: true,
      message: 'Base de données injoignable : seuls l’upload et le lancement restent utilisables.',
    })
  }
}
