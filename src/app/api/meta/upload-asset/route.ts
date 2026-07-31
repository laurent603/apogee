import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const accountId = formData.get('accountId') as string | null

  if (!file || !accountId) return NextResponse.json({ error: 'Missing file or accountId' }, { status: 400 })

  const token = session.accessToken as string

  if (file.type.startsWith('video/')) {
    // Video upload — Meta requires chunked upload; for now return a placeholder
    // Full video upload can be added later via /resumable_upload
    return NextResponse.json({ error: 'Video upload not yet supported — use images for now' }, { status: 422 })
  }

  // Image upload via adimages
  const uploadForm = new FormData()
  uploadForm.append(file.name, file)
  uploadForm.append('access_token', token)

  const res = await fetch(`https://graph.facebook.com/v21.0/${accountId}/adimages`, {
    method: 'POST',
    body: uploadForm,
  })

  const data = await res.json()

  if (data.error) {
    console.error('Meta adimages error:', data.error)
    return NextResponse.json({ error: data.error.message }, { status: 400 })
  }

  // data.images is keyed by filename
  const images = data.images as Record<string, { hash: string; url: string }> | undefined
  if (!images) return NextResponse.json({ error: 'No image data returned' }, { status: 500 })

  const imageData = Object.values(images)[0]
  return NextResponse.json({ hash: imageData.hash, url: imageData.url })
}
