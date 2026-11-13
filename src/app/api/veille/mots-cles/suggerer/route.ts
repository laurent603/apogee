import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { proposerMotsCles } from '@/lib/veille/gemini'

/**
 * Une marque sauvegardée ou suivie : Gemini propose les mots-clés qui
 * ramèneraient ses concurrents. Ils attendent une validation dans Discovery.
 * Une seule fois par marque.
 */
const cle = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })
  const corps = await req.json().catch(() => null)
  if (typeof corps?.marqueId !== 'string') return NextResponse.json({ erreur: 'marqueId manquant' }, { status: 400 })

  const marque = await prisma.veilleMarque.findUnique({
    where: { id: corps.marqueId },
    select: { nom: true, masquee: true, pubs: { where: { masquee: false }, take: 6, orderBy: { premiereVue: 'desc' }, select: { titre: true, texte: true } } },
  })
  if (!marque || marque.masquee) return NextResponse.json({ ajoutes: [] })
  if (await prisma.veilleMotCle.findFirst({ where: { origine: marque.nom }, select: { id: true } })) return NextResponse.json({ ajoutes: [], deja: true })
  const textes = marque.pubs.map((p) => [p.titre, p.texte].filter(Boolean).join(' — ')).filter(Boolean)
  if (!textes.length) return NextResponse.json({ ajoutes: [] })

  const existants = await prisma.veilleMotCle.findMany({ select: { motCle: true } })
  let proposes: string[]
  try {
    proposes = await proposerMotsCles(marque.nom, textes, existants.map((e) => e.motCle))
  } catch (e) {
    console.error('[veille/mots-cles/suggerer]', (e as Error).message)
    return NextResponse.json({ erreur: 'Gemini n’a pas répondu' }, { status: 502 })
  }

  const connus = new Set(existants.map((e) => cle(e.motCle)))
  const ajoutes: string[] = []
  for (const brut of proposes) {
    const motCle = brut.replace(/[«»"“”]/g, '').trim().replace(/\s+/g, ' ')
    if (motCle.length < 2 || motCle.length > 80 || connus.has(cle(motCle))) continue
    connus.add(cle(motCle))
    ajoutes.push(motCle)
  }
  if (ajoutes.length) {
    await prisma.veilleMotCle.createMany({ data: ajoutes.map((motCle) => ({ motCle, statut: 'suggere', origine: marque.nom })), skipDuplicates: true })
  }
  return NextResponse.json({ ajoutes })
}
