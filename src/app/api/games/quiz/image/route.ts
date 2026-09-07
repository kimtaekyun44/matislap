import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'
import {
  QUIZ_IMAGE_BUCKET,
  QUIZ_IMAGE_MAX_BYTES,
  QUIZ_IMAGE_MIME_TYPES,
  QUIZ_IMAGE_EXTENSIONS,
} from '@/lib/games/quiz-image'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)


// POST /api/games/quiz/image - 문제 이미지 업로드 (강사 전용)
export async function POST(request: NextRequest) {
  try {
    const session = await getInstructorSession()
    if (!session) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    const roomId = formData.get('room_id')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '이미지 파일이 필요합니다.' }, { status: 400 })
    }

    if (typeof roomId !== 'string' || !roomId) {
      return NextResponse.json({ error: '방 ID가 필요합니다.' }, { status: 400 })
    }

    // 방 소유권 확인 - 남의 방에 파일을 올리지 못하게 한다
    const { data: room } = await supabaseAdmin
      .from('game_rooms')
      .select('id, instructor_id')
      .eq('id', roomId)
      .single()

    if (!room || room.instructor_id !== session.instructorId) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }

    if (!QUIZ_IMAGE_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'jpg, png, webp, gif 형식만 올릴 수 있습니다.' },
        { status: 400 }
      )
    }

    if (file.size > QUIZ_IMAGE_MAX_BYTES) {
      return NextResponse.json(
        { error: '이미지 용량은 5MB 이하여야 합니다.' },
        { status: 400 }
      )
    }

    const extension = QUIZ_IMAGE_EXTENSIONS[file.type] || 'jpg'
    const path = `${roomId}/${crypto.randomUUID()}.${extension}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from(QUIZ_IMAGE_BUCKET)
      .upload(path, await file.arrayBuffer(), {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('이미지 업로드 오류:', uploadError)
      return NextResponse.json(
        { error: '이미지 업로드에 실패했습니다.' },
        { status: 500 }
      )
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(QUIZ_IMAGE_BUCKET).getPublicUrl(path)

    return NextResponse.json({ success: true, image_url: publicUrl })
  } catch (error) {
    console.error('이미지 업로드 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
