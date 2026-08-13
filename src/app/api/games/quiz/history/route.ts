import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET /api/games/quiz/history?room_id=xxx&question_id=yyy - 퀴즈 문제 변경 이력 조회 (강사 전용)
export async function GET(request: NextRequest) {
  try {
    const session = await getInstructorSession()
    if (!session) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get('room_id')
    const questionId = searchParams.get('question_id')

    if (!roomId) {
      return NextResponse.json(
        { error: '방 ID가 필요합니다.' },
        { status: 400 }
      )
    }

    // 방 소유권 확인
    const { data: room, error: roomError } = await supabaseAdmin
      .from('game_rooms')
      .select('id, instructor_id')
      .eq('id', roomId)
      .single()

    if (roomError || !room) {
      return NextResponse.json(
        { error: '방을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (room.instructor_id !== session.instructorId) {
      return NextResponse.json(
        { error: '이 방의 이력을 조회할 권한이 없습니다.' },
        { status: 403 }
      )
    }

    let query = supabaseAdmin
      .from('quiz_question_history')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })

    // 특정 문제의 이력만 보고 싶을 때
    if (questionId) {
      query = query.eq('question_id', questionId)
    }

    const { data: history, error } = await query

    if (error) {
      console.error('퀴즈 이력 조회 오류:', error)
      return NextResponse.json(
        { error: '이력을 불러오는데 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ history })
  } catch (error) {
    console.error('퀴즈 이력 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
