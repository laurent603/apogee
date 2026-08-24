import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { anthropic, MODEL_CHAT } from '@/lib/anthropic'

const SYSTEM = `Tu es un expert en stratégie créative publicitaire Meta (Facebook/Instagram).
Tu analyses des commentaires de publicités pour extraire des insights actionnables qui permettront de créer de meilleures publicités — textes, hooks, angles créatifs, briefs vidéo/image.
Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks.`

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { posts } = await req.json() as {
    posts: Array<{ adName: string; comments: Array<{ message: string; likeCount: number }> }>
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

  const stream = await anthropic.messages.stream({
    model: MODEL_CHAT,
    // The schema has six sections with nested examples; 4096 truncated the JSON
    // mid-string on accounts with a few dozen comments.
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: 'user', content: userMessage }],
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          controller.enqueue(encoder.encode(chunk.delta.text))
        }
      }
      controller.close()
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
