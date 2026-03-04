import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

// GET /api/games/survey?room_id=xxx - 방의 설문 문항 목록 조회
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

    const supabase = await createServerSupabaseClient()

    const { data: questions, error } = await supabase
      .from('survey_questions')
      .select('*')
      .eq('room_id', roomId)
      .order('order_num', { ascending: true })

    if (error) {
      console.error('설문 문항 조회 오류:', error)
      return NextResponse.json(
        { error: '설문 문항을 불러오는데 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ questions })
  } catch (error) {
    console.error('설문 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// POST /api/games/survey - 설문 문항 생성 (강사 전용)
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
    const { room_id, question_text, question_type, options } = body

    if (!room_id || !question_text || !question_type) {
      return NextResponse.json(
        { error: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      )
    }

    if (!['short_answer', 'choice_2', 'choice_4'].includes(question_type)) {
      return NextResponse.json(
        { error: '유효하지 않은 문항 유형입니다.' },
        { status: 400 }
      )
    }

    if (question_type === 'choice_2' && (!options || options.length !== 2)) {
      return NextResponse.json(
        { error: '2지선다는 정확히 2개의 선택지가 필요합니다.' },
        { status: 400 }
      )
    }

    if (question_type === 'choice_4' && (!options || options.length !== 4)) {
      return NextResponse.json(
        { error: '4지선다는 정확히 4개의 선택지가 필요합니다.' },
        { status: 400 }
      )
    }

    const supabase = await createServerSupabaseClient()

    // 방 소유권 확인
    const { data: room, error: roomError } = await supabase
      .from('game_rooms')
      .select('id, instructor_id')
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
        { error: '이 방의 설문을 수정할 권한이 없습니다.' },
        { status: 403 }
      )
    }

    // 마지막 문항 순서 조회
    const { data: lastQuestion } = await supabase
      .from('survey_questions')
      .select('order_num')
      .eq('room_id', room_id)
      .order('order_num', { ascending: false })
      .limit(1)
      .single()

    const nextOrder = lastQuestion ? lastQuestion.order_num + 1 : 1

    const { data: question, error: insertError } = await supabase
      .from('survey_questions')
      .insert({
        room_id,
        question_text,
        question_type,
        options: question_type === 'short_answer' ? null : options,
        order_num: nextOrder
      })
      .select()
      .single()

    if (insertError) {
      console.error('설문 문항 생성 오류:', insertError)
      return NextResponse.json(
        { error: '설문 문항 생성에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, question }, { status: 201 })
  } catch (error) {
    console.error('설문 생성 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
