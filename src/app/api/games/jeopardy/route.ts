import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export type JeopardyQuestionType = 'short_answer' | '2지선다' | '4지선다'

export interface JeopardyQuestionPayload {
  category: string
  points: number
  content: string
  answer: string
  question_type: JeopardyQuestionType
  options: string[]
}

// GET /api/games/jeopardy?room_id=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get('room_id')

    if (!roomId) {
      return NextResponse.json({ error: '방 ID가 필요합니다.' }, { status: 400 })
    }

    const { data: questions, error } = await supabase
      .from('jeopardy_questions')
      .select('*')
      .eq('room_id', roomId)
      .order('category')
      .order('points', { ascending: true })

    if (error) {
      console.error('제퍼디 문제 조회 오류:', error)
      return NextResponse.json({ error: '문제를 불러오지 못했습니다.' }, { status: 500 })
    }

    return NextResponse.json({ questions })
  } catch (error) {
    console.error('제퍼디 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

// POST /api/games/jeopardy - 문제 일괄 업로드 (기존 문제 교체)
export async function POST(request: NextRequest) {
  try {
    const session = await getInstructorSession()
    if (!session) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const body = await request.json()
    const { room_id, questions }: { room_id: string; questions: JeopardyQuestionPayload[] } = body

    if (!room_id || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: '필수 데이터가 누락되었습니다.' }, { status: 400 })
    }


    // 방 소유 및 상태 확인
    const { data: room, error: roomError } = await supabase
      .from('game_rooms')
      .select('id, instructor_id, status, game_type')
      .eq('id', room_id)
      .single()

    if (roomError || !room) {
      return NextResponse.json({ error: '게임 방을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (room.instructor_id !== session.instructorId) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }

    if (room.game_type !== 'jeopardy') {
      return NextResponse.json({ error: '제퍼디 게임방이 아닙니다.' }, { status: 400 })
    }

    if (room.status !== 'waiting') {
      return NextResponse.json({ error: '게임 시작 전에만 문제를 수정할 수 있습니다.' }, { status: 400 })
    }

    // 기존 문제 삭제 후 새로 삽입
    const { error: deleteError } = await supabase
      .from('jeopardy_questions')
      .delete()
      .eq('room_id', room_id)

    if (deleteError) {
      console.error('제퍼디 문제 삭제 오류:', deleteError)
      return NextResponse.json({ error: '기존 문제 삭제에 실패했습니다.' }, { status: 500 })
    }

    const rows = questions.map((q, idx) => ({
      room_id,
      category: q.category,
      points: q.points,
      content: q.content,
      answer: q.answer,
      question_type: q.question_type,
      options: q.options,
      is_used: false,
      order_num: idx + 1,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('jeopardy_questions')
      .insert(rows)
      .select()

    if (insertError) {
      console.error('제퍼디 문제 저장 오류:', insertError)
      return NextResponse.json({ error: '문제 저장에 실패했습니다.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: inserted.length })
  } catch (error) {
    console.error('제퍼디 업로드 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
