import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { anthropic, MODEL_CHAT } from '@/lib/anthropic'
import { notifyIncident } from '@/lib/notify'

const SYSTEM = `Tu es un expert en stratégie créative publicitaire Meta (Facebook/Instagram).
Tu analyses des commentaires de publicités pour extraire des insights actionnables qui permettront de créer de meilleures publicités — textes, hooks, angles créatifs, briefs vidéo/image.
Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks.`

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { posts, dbAccountId, accountName } = await req.json() as {
    posts: Array<{ adName: string; comments: Array<{ message: string; likeCount: number }> }>
    dbAccountId?: string
    accountName?: string
  }

  // Flatten all comments
  const allComments = posts.flatMap((p) =>
    p.comments.map((c) => ({ text: c.message, likes: c.likeCount, ad: p.adName }))
  )

  if (allComments.length === 0) {
    return new Response(JSON.stringify({ error: 'Aucun commentaire à analyser' }), { status: 400 })
  }

  const commentsList = allComments
    .slice(0, 500)
    .map((c, i) => `[${i + 1}] ${c.likes > 0 ? `(${c.likes}❤️) ` : ''}${c.text}`)
    .join('\n')

  const userMessage = `Voici ${allComments.length} commentaires de publicités Facebook/Instagram (max 500 affichés) :

${commentsList}

Réponds avec ce JSON exact (toutes les clés en français, valeurs en français) :
{
  "sentiment": { "positif": number, "neutre": number, "negatif": number },
  "synthese": "string — résumé exécutif 2-3 phrases sur l'état général des commentaires",
  "pain_points": [
    { "theme": "string", "frequence": "haute|moyenne|faible", "description": "string", "exemples": ["string","string"] }
  ],
  "signaux_positifs": [
    { "theme": "string", "frequence": "haute|moyenne|faible", "description": "string", "exemples": ["string","string"] }
  ],
  "objections": [
    { "objection": "string", "frequence": "haute|moyenne|faible", "reponse_suggeree": "string" }
  ],
  "angles_creatifs": [
    { "angle": "string", "hook": "string — accroche concrète à utiliser en début de vidéo ou titre", "pourquoi": "string" }
  ],
  "briefs_creation": [
    { "type": "video|image", "format": "feed|story|les_deux", "titre": "string", "concept": "string", "script_hook": "string", "cta": "string" }
  ]
}`

  const context = `${allComments.length} commentaires · ${posts.length} publicité${posts.length > 1 ? 's' : ''}\nPublicités : ${posts.map((p) => p.adName).slice(0, 10).join(', ')}`

  // L'ouverture du flux peut échouer avant tout streaming (clé Anthropic,
  // quota, modèle indisponible). Sans ce try, la requête partait en rejet
  // non capturé et le client ne recevait qu'un 500 muet.
  let stream
  try {
    stream = await anthropic.messages.stream({
      model: MODEL_CHAT,
      // The schema has six sections with nested examples; 4096 truncated the JSON
      // mid-string on accounts with a few dozen comments.
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
    })
  } catch (err) {
    await notifyIncident({
      source: 'comments',
      title: 'Analyse des commentaires impossible à démarrer',
      error: err,
      cause: 'L\'appel au modèle a été refusé avant tout traitement. Vérifiez la clé Anthropic et le quota du compte.',
      context,
      adAccountId: dbAccountId,
      accountName,
      email: true,
    })
    return new Response(JSON.stringify({ error: 'L\'analyse n\'a pas pu démarrer. L\'incident est enregistré dans Notifications.' }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
      } catch (err) {
        // Le flux s'est coupé en route : le client reçoit du JSON tronqué et
        // n'affichera qu'une erreur de parsing, sans jamais dire pourquoi.
        await notifyIncident({
          source: 'comments',
          title: 'Analyse des commentaires interrompue',
          error: err,
          cause: 'Le flux s\'est coupé pendant la génération. Le résultat affiché est incomplet ou illisible — relancez l\'analyse.',
          context,
          adAccountId: dbAccountId,
          accountName,
          email: true,
        })
        controller.enqueue(encoder.encode('\n{"__erreur__":"flux interrompu"}'))
      }
      controller.close()
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
