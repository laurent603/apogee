import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { anthropic, MODEL_CHAT } from '@/lib/anthropic'
import { notifyIncident } from '@/lib/notify'

/**
 * L'analyse produit des preuves, pas des scripts.
 *
 * Elle produisait les deux : six livrables dans un seul appel, dont des
 * « angles créatifs » et des « briefs » en quatre champs. Le budget se
 * répartissait sur les six, chaque angle recevait trois phrases, et rien
 * n'était utilisable en production.
 *
 * Écrire le script est déjà le métier du générateur de briefs, qui dispose
 * des chiffres de la publicité, du contexte de marque et d'un raisonnement
 * étendu. Ici on prépare sa matière première : des objections regroupées,
 * comptées, et surtout **citées mot pour mot**. Une paraphrase — « les gens
 * trouvent ça cher » — ne se tourne pas ; une phrase réelle de prospect se
 * lit à voix haute devant une caméra.
 */
const SYSTEM = `Tu es analyste de commentaires publicitaires Meta.

Ton rôle est le diagnostic, pas la rédaction. Tu ne proposes ni script, ni
accroche, ni concept : tu établis ce que les gens disent réellement, en le
prouvant.

Règles :
- Une objection n'existe que si plusieurs commentaires la portent. Compte-les.
- Chaque objection est appuyée par des citations LITTÉRALES, recopiées sans
  reformulation, faute d'orthographe comprise. Ne fabrique jamais une citation.
- Regroupe par ce que la personne veut dire, pas par les mots employés :
  « c'est cher » et « 22000 balles pour ça ? » sont la même objection.
- Classe par nombre d'occurrences décroissant. Ce qui revient trois fois pèse
  plus que ce qui frappe une fois.

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
    {
      "objection": "string — ce qui bloque, formulé du point de vue du prospect",
      "occurrences": number,
      "frequence": "haute|moyenne|faible",
      "verbatims": [
        { "texte": "string — CITATION LITTÉRALE, recopiée telle quelle", "pub": "string — nom de la publicité", "likes": number }
      ],
      "ce_que_ca_revele": "string — ce que cette objection dit de la perception de l'offre",
      "reponse_suggeree": "string — l'argument qui y répond, pas un slogan"
    }
  ]
}

Contraintes :
- 3 à 8 objections, classées par occurrences décroissantes.
- 2 à 4 verbatims par objection, recopiés mot pour mot depuis la liste.
- Pas d'angle, pas de hook, pas de brief : ce n'est pas ton rôle ici.`

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
