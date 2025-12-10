import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

// GET /api/games/quiz?room_id=xxx - 방의 퀴즈 문제 목록 조회
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

    // 퀴즈 문제 목록 조회 (순서대로)
    const { data: questions, error } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('room_id', roomId)
      .order('order_num', { ascending: true })

    if (error) {
      console.error('퀴즈 문제 조회 오류:', error)
      return NextResponse.json(
        { error: '퀴즈 문제를 불러오는데 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ questions })
  } catch (error) {
    console.error('퀴즈 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// POST /api/games/quiz - 퀴즈 문제 생성 (강사 전용)
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
    const { room_id, question_text, question_type, options, correct_answer, time_limit, points } = body

    // 필수 필드 검증
    if (!room_id || !question_text || !question_type || !correct_answer) {
      return NextResponse.json(
        { error: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      )
    }

    // 문제 유형 검증
    if (!['multiple_choice', 'ox'].includes(question_type)) {
      return NextResponse.json(
        { error: '유효하지 않은 문제 유형입니다.' },
        { status: 400 }
      )
    }

    // 객관식인 경우 options 필수
    if (question_type === 'multiple_choice' && (!options || !Array.isArray(options) || options.length < 2)) {
      return NextResponse.json(
        { error: '객관식 문제는 최소 2개 이상의 선택지가 필요합니다.' },
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
        { error: '이 방의 퀴즈를 수정할 권한이 없습니다.' },
        { status: 403 }
      )
    }

    // 현재 방의 마지막 문제 순서 조회
    const { data: lastQuestion } = await supabase
      .from('quiz_questions')
      .select('order_num')
      .eq('room_id', room_id)
      .order('order_num', { ascending: false })
      .limit(1)
      .single()

    const nextOrder = lastQuestion ? lastQuestion.order_num + 1 : 1

    // 퀴즈 문제 생성
    const { data: question, error: insertError } = await supabase
      .from('quiz_questions')
      .insert({
        room_id,
        question_text,
        question_type,
        options: question_type === 'ox' ? ['O', 'X'] : options,
        correct_answer,
        time_limit: time_limit || 30,
        points: points || 100,
        order_num: nextOrder
      })
      .select()
      .single()

    if (insertError) {
      console.error('퀴즈 문제 생성 오류:', insertError)
      return NextResponse.json(
        { error: '퀴즈 문제 생성에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, question }, { status: 201 })
  } catch (error) {
    console.error('퀴즈 생성 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
