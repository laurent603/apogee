import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { metaFetch } from '@/lib/meta'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('accountId')
  const type = searchParams.get('type') || 'campaigns'

  if (!accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 })
  const token = session.accessToken as string

  try {
    if (type === 'campaigns') {
      const data = await metaFetch(`/${accountId}/campaigns`, token, {
        fields: 'id,name,status,objective,daily_budget,lifetime_budget,budget_rebalance_flag,special_ad_categories',
        limit: '100',
        filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED'] }]),
      })
      return NextResponse.json(data.data || [])
    }

    if (type === 'adsets') {
      const campaignId = searchParams.get('campaignId')
      const path = campaignId ? `/${campaignId}/adsets` : `/${accountId}/adsets`
      const data = await metaFetch(path, token, {
        fields: [
          'id', 'name', 'campaign_id', 'status',
          // Dit si l'ad set envoie sur un formulaire natif (`ON_AD`) ou sur un
          // site. Le lancement en a besoin : l'objectif de campagne ne le dit
          // pas, et une campagne Prospects peut faire les deux.
          'destination_type',
          'optimization_goal', 'billing_event', 'bid_strategy',
          'daily_budget', 'lifetime_budget',
          'targeting',
          'promoted_object',
          'attribution_spec',
          'start_time', 'end_time',
        ].join(','),
        limit: '200',
      })
      return NextResponse.json(data.data || [])
    }

    if (type === 'ads') {
      const adsetId = searchParams.get('adsetId')
      const campaignId = searchParams.get('campaignId')
      const path = adsetId ? `/${adsetId}/ads` : campaignId ? `/${campaignId}/ads` : `/${accountId}/ads`

      function extractFromCreative(creative: Record<string, unknown> | undefined) {
        const oss = creative?.object_story_spec as Record<string, unknown> | undefined
        const ld = oss?.link_data as Record<string, unknown> | undefined
        const vd = oss?.video_data as Record<string, unknown> | undefined
        const ossCta = (ld?.call_to_action || vd?.call_to_action) as { type?: string; value?: { link?: string; lead_gen_form_id?: string } } | undefined
        // Advantage+ creative: copy in asset_feed_spec (accessible on creative node directly)
        const afs = creative?.asset_feed_spec as Record<string, unknown> | undefined
        const afsBodies = (afs?.bodies as Array<{ text: string }> | undefined) || []
        const afsTitles = (afs?.titles as Array<{ text: string }> | undefined) || []
        const afsDescs = (afs?.descriptions as Array<{ text: string }> | undefined) || []
        const afsCtas = (afs?.call_to_action_types as string[] | undefined) || []
        const afsCTAs = (afs?.call_to_actions as Array<{ type: string; value?: { lead_gen_form_id?: string; link?: string } }> | undefined) || []
        const afsLinks = (afs?.link_urls as Array<{ website_url: string }> | undefined) || []
        return {
          _pageId: (oss?.page_id as string | undefined) || '',
          primary_text: (ld?.message || vd?.message || afsBodies[0]?.text || creative?.body || '') as string,
          headline: (ld?.name || vd?.title || afsTitles[0]?.text || creative?.title || '') as string,
          description: (ld?.description || vd?.link_description || afsDescs[0]?.text || '') as string,
          cta_type: (ossCta?.type || afsCtas[0] || 'LEARN_MORE') as string,
          destination_url: (ld?.link || ossCta?.value?.link || afsCTAs[0]?.value?.link || afsLinks[0]?.website_url || '') as string,
          lead_gen_form_id: (ossCta?.value?.lead_gen_form_id || afsCTAs[0]?.value?.lead_gen_form_id || '') as string,
          thumbnail: (creative?.thumbnail_url || creative?.image_url || null) as string | null,
        }
      }

      // Fetch ads — for Advantage+ creative, do a follow-up fetch of the creative directly
      try {
        const data = await metaFetch(path, token, {
          fields: [
            'id', 'name', 'adset_id', 'campaign_id', 'status',
            'creative{id,name,title,body,image_url,thumbnail_url,video_id,' +
              'object_story_spec{page_id,' +
                'link_data{message,name,description,link,image_hash,call_to_action{type,value{lead_gen_form_id,link}}},' +
                            // `link` n'existe pas sur `video_data` : Meta valide l'expansion
            // objet par objet et rejette TOUTE la requête pour un seul créatif
            // fautif — `(#100) Tried accessing nonexisting field (link)`. La
            // route basculait alors sur son repli minimal, sans
            // object_story_spec ni asset_feed_spec : plus de texte, plus de
            // page, plus de formulaire. Le lien se lit dans
            // `call_to_action.value.link`, qui est demandé juste après.
            'video_data{message,title,link_description,video_id,call_to_action{type,value{lead_gen_form_id,link}}}' +
              '}}',
          ].join(','),
          limit: '200',
        })
        const ads = (data.data as Record<string, unknown>[] || [])
        const results = await Promise.all(ads.map(async (ad: Record<string, unknown>) => {
          let creative = ad.creative as Record<string, unknown> | undefined
          let parsed = extractFromCreative(creative)
          // Advantage+ creative: object_story_spec has only page_id, copy is in asset_feed_spec
          // Fetch the creative directly to get asset_feed_spec
          if (!parsed.primary_text && creative?.id) {
            try {
              const cr2 = await metaFetch(`/${creative.id}`, token, {
                fields: 'id,body,title,asset_feed_spec,object_story_spec',
              })
              creative = { ...creative, ...cr2 }
              parsed = extractFromCreative(creative)
            } catch { /* keep empty */ }
          }
          return { ...ad, creative, _pageId: parsed._pageId, _parsed: { ...parsed } }
        }))
        return NextResponse.json(results)
      } catch (e1) {
        console.error('Ads full-fields error:', e1)
        // Fallback: minimal fields only
        try {
          const data = await metaFetch(path, token, {
            fields: 'id,name,adset_id,campaign_id,status,creative{id,name,title,body,image_url,thumbnail_url}',
            limit: '200',
          })
          const ads = (data.data as Record<string, unknown>[] || [])
          return NextResponse.json(ads.map((ad: Record<string, unknown>) => {
            const creative = ad.creative as Record<string, unknown> | undefined
            const parsed = extractFromCreative(creative)
            return { ...ad, _pageId: parsed._pageId, _parsed: { ...parsed } }
          }))
        } catch (e2) {
          const msg = e2 instanceof Error ? e2.message : String(e2)
          console.error('Ads minimal-fields error:', msg)
          return NextResponse.json({ _error: msg, data: [] })
        }
      }
    }

    if (type === 'pages') {
      const data = await metaFetch('/me/accounts', token, {
        fields: 'id,name,picture',
        limit: '50',
      })
      return NextResponse.json(data.data || [])
    }

    if (type === 'leadforms') {
      const pageId = searchParams.get('pageId')
      if (!pageId) return NextResponse.json({ error: 'Missing pageId' }, { status: 400 })

      // /{pageId}/leadgen_forms requires a Page Access Token (error #190 with user token)
      // Approach 1: /me/accounts returns page tokens for all managed pages
      let pageToken = token
      try {
        const accounts = await metaFetch('/me/accounts', token, { fields: 'id,access_token', limit: '50' })
        const match = (accounts.data || []).find((p: { id: string; access_token?: string }) => p.id === pageId)
        if (match?.access_token) pageToken = match.access_token
      } catch {
        // Approach 2: fetch page token directly from the page node
        try {
          const pageData = await metaFetch(`/${pageId}`, token, { fields: 'access_token' })
          if (pageData.access_token) pageToken = pageData.access_token as string
        } catch { /* fall through — will likely fail with #190 */ }
      }

      const data = await metaFetch(`/${pageId}/leadgen_forms`, pageToken, {
        fields: 'id,name,status,lead_count',
        limit: '50',
      })
      return NextResponse.json(data.data || [])
    }

    if (type === 'pixels') {
      const data = await metaFetch(`/${accountId}/adspixels`, token, {
        fields: 'id,name,last_fired_time',
        limit: '50',
      })
      return NextResponse.json(data.data || [])
    }

    /**
     * Recherche d'intérêts, comportements et évènements de vie.
     *
     * `targetingsearch` plutôt que `/search?type=adinterest` : il est scopé au
     * compte publicitaire — donc des tailles d'audience réalistes — et il
     * renvoie le `type` de chaque entrée. C'est ce type qui commande le
     * regroupement dans `flexible_spec` : Meta attend `{ interests: [...],
     * behaviors: [...] }`, pas une liste à plat.
     */
    if (type === 'interests') {
      const q = searchParams.get('q')?.trim()
      if (!q || q.length < 2) return NextResponse.json([])
      const data = await metaFetch(`/${accountId}/targetingsearch`, token, {
        q, locale: 'fr_FR', limit: '25',
      })
      const RETENUS = new Set(['interests', 'behaviors', 'life_events', 'industries', 'income', 'family_statuses'])
      return NextResponse.json(
        (data.data as Record<string, unknown>[] || [])
          .filter(x => RETENUS.has(String(x.type)))
          .map(x => ({
            id: String(x.id),
            name: String(x.name ?? ''),
            type: String(x.type),
            taille: Number(x.audience_size_lower_bound ?? 0),
            chemin: (x.path as string[] | undefined)?.join(' › ') ?? '',
          })),
      )
    }

    /**
     * Recherche de villes. Le rayon autour d'une ville est le ciblage réel de
     * la quasi-totalité des comptes : un artisan ne vend pas à la France.
     *
     * `country_code` est indispensable : sans lui, « 69000 » remonte des codes
     * postaux turcs et japonais avant le moindre résultat français.
     */
    if (type === 'geo') {
      const q = searchParams.get('q')?.trim()
      if (!q || q.length < 2) return NextResponse.json([])
      const pays = searchParams.get('pays') || 'FR'
      const data = await metaFetch('/search', token, {
        type: 'adgeolocation',
        location_types: JSON.stringify(['city']),
        country_code: pays,
        q, locale: 'fr_FR', limit: '15',
      })
      return NextResponse.json(
        (data.data as Record<string, unknown>[] || []).map(x => ({
          key: String(x.key),
          nom: String(x.name ?? ''),
          region: String(x.region ?? ''),
          pays: String(x.country_code ?? pays),
        })),
      )
    }

    /**
     * Validité des centres d'intérêt. Meta en retire régulièrement — une
     * audience enregistrée il y a un an en contient souvent deux ou trois qui
     * n'existent plus, et un seul suffit à faire refuser l'ensemble entier
     * (sous-code 1870247). Cette réponse est exactement celle de
     * `validate_only`, vérifié intérêt par intérêt.
     */
    if (type === 'interests_valid') {
      const ids = (searchParams.get('ids') || '').split(',').map(x => x.trim()).filter(Boolean)
      if (!ids.length) return NextResponse.json([])
      const data = await metaFetch('/search', token, {
        type: 'adinterestvalid',
        interest_fbid_list: JSON.stringify(ids.slice(0, 200)),
        locale: 'fr_FR',
      })
      return NextResponse.json(
        (data.data as Record<string, unknown>[] || []).map(x => ({
          id: String(x.id), name: String(x.name ?? ''), valid: x.valid !== false,
        })),
      )
    }

    /**
     * Les audiences enregistrées de l'Ads Manager — distinctes des audiences
     * personnalisées ci-dessous. Une audience enregistrée porte un ciblage
     * complet (lieux, âge, centres d'intérêt) ; c'est elle qui correspond à
     * « une audience à tester », et elle s'importe dans le constructeur.
     *
     * Meta ne permet pas de rattacher une audience enregistrée à un ensemble
     * par son identifiant : c'est son `targeting` qu'on recopie.
     */
    if (type === 'saved_audiences') {
      const data = await metaFetch(`/${accountId}/saved_audiences`, token, {
        fields: 'id,name,targeting,approximate_count_lower_bound',
        limit: '100',
      })
      return NextResponse.json(data.data || [])
    }

    if (type === 'audiences') {
      // Les similaires étaient exclues ici. Le stade 3 de la méthode J7 demande
      // explicitement de tester « similaire valeur vie » et « similaire acheteurs
      // 3/5/10 % » : les filtrer revenait à interdire la moitié du stade.
      // La limite passe à 200 : sans le filtre, les similaires occupent des places
      // dans la même page et pouvaient évincer des audiences classiques.
      const data = await metaFetch(`/${accountId}/customaudiences`, token, {
        fields: 'id,name,approximate_count_lower_bound,subtype',
        limit: '200',
      })
      return NextResponse.json(data.data || [])
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
  } catch (err) {
    console.error('Configure API error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
