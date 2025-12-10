import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET /api/games/drawing?room_id=xxx - 제시어 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get('room_id')

    if (!roomId) {
      return NextResponse.json(
        { error: '방 ID가 필요합니다.' },
        { status: 400 }
      )
    }

    const { data: words, error } = await supabaseAdmin
      .from('drawing_words')
      .select('*')
      .eq('room_id', roomId)
      .order('order_num', { ascending: true })

    if (error) {
      console.error('제시어 조회 오류:', error)
      return NextResponse.json(
        { error: '제시어를 불러오는데 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ words: words || [] })
  } catch (error) {
    console.error('제시어 목록 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// POST /api/games/drawing - 제시어 추가 (강사 전용)
export async function POST(request: NextRequest) {
  try {
    const session = await getInstructorSession()
    if (!session) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { room_id, word, hint } = body

    if (!room_id || !word?.trim()) {
      return NextResponse.json(
        { error: '방 ID와 제시어가 필요합니다.' },
        { status: 400 }
      )
    }

    // 방 소유권 확인
    const { data: room, error: roomError } = await supabaseAdmin
      .from('game_rooms')
      .select('id, instructor_id, game_type')
      .eq('id', room_id)
      .single()

    if (roomError || !room) {
      return NextResponse.json(
        { error: '방을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (room.instructor_id !== session.instructorId) {
      return NextResponse.json(
        { error: '이 방의 제시어를 추가할 권한이 없습니다.' },
        { status: 403 }
      )
    }

    if (room.game_type !== 'drawing') {
      return NextResponse.json(
        { error: '그림 그리기 게임 방이 아닙니다.' },
        { status: 400 }
      )
    }

    // 현재 제시어 수 조회
    const { count } = await supabaseAdmin
      .from('drawing_words')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room_id)

    // 제시어 추가
    const { data: newWord, error: insertError } = await supabaseAdmin
      .from('drawing_words')
      .insert({
        room_id,
        word: word.trim(),
        hint: hint?.trim() || null,
        order_num: (count || 0) + 1
      })
      .select()
      .single()

    if (insertError) {
      console.error('제시어 추가 오류:', insertError)
      return NextResponse.json(
        { error: '제시어 추가에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      word: newWord
    })
  } catch (error) {
    console.error('제시어 추가 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
