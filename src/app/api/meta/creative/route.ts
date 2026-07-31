import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdCreative, createAd } from '@/lib/meta'

const META_API_VERSION = process.env.META_API_VERSION || 'v21.0'
const BASE = `https://graph.facebook.com/${META_API_VERSION}`

async function uploadImageToMeta(accountId: string, token: string, buffer: Buffer, filename: string) {
  const form = new FormData()
  form.append('access_token', token)
  form.append('filename', filename)
  const blob = new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' })
  form.append('source', blob, filename)
  const res = await fetch(`${BASE}/${accountId}/adimages`, { method: 'POST', body: form })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  const images = data.images
  return Object.values(images)[0] as { hash: string }
}

async function uploadVideoToMeta(accountId: string, token: string, buffer: Buffer, filename: string, title: string) {
  const form = new FormData()
  form.append('access_token', token)
  form.append('title', title)
  const blob = new Blob([new Uint8Array(buffer)], { type: 'video/mp4' })
  form.append('source', blob, filename)
  const res = await fetch(`https://graph-video.facebook.com/${META_API_VERSION}/${accountId}/advideos`, { method: 'POST', body: form })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.id as string
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  const accountId = formData.get('accountId') as string
  const adsetId = formData.get('adsetId') as string
  const adName = formData.get('adName') as string
  const headline = formData.get('headline') as string
  const primaryText = formData.get('primaryText') as string
  const cta = formData.get('cta') as string
  const destinationUrl = formData.get('destinationUrl') as string
  const type = formData.get('type') as string

  const token = session.accessToken as string
  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    let creative: Record<string, unknown>

    if (type === 'image') {
      const imgData = await uploadImageToMeta(accountId, token, buffer, file.name)
      creative = await createAdCreative(accountId, token, {
        name: adName,
        object_story_spec: {
          link_data: {
            image_hash: imgData.hash,
            link: destinationUrl,
            message: primaryText,
            name: headline,
            call_to_action: { type: cta, value: { link: destinationUrl } },
          },
          page_id: await getPageId(token),
        },
      })
    } else {
      const videoId = await uploadVideoToMeta(accountId, token, buffer, file.name, adName)
      creative = await createAdCreative(accountId, token, {
        name: adName,
        object_story_spec: {
          video_data: {
            video_id: videoId,
            title: headline,
            message: primaryText,
            call_to_action: { type: cta, value: { link: destinationUrl } },
          },
          page_id: await getPageId(token),
        },
      })
    }

    if (creative.error) throw new Error(String(creative.error))

    const ad = await createAd(accountId, token, {
      name: adName,
      adset_id: adsetId,
      creative: { creative_id: creative.id },
      status: 'PAUSED',
    })

    if (ad.error) throw new Error(String(ad.error))

    return NextResponse.json({ adId: ad.id, creativeId: creative.id })
  } catch (err) {
    console.error('Creative publish error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

async function getPageId(token: string): Promise<string> {
  const res = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${token}&limit=1`)
  const data = await res.json()
  return data.data?.[0]?.id || ''
}
