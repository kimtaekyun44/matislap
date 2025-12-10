import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

// Service Role 클라이언트 (RLS 우회)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET /api/games/quiz/status?room_id=xxx - 퀴즈 게임 현재 상태 조회
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

    // 방 정보 조회
    const { data: room, error: roomError } = await supabaseAdmin
      .from('game_rooms')
      .select('id, room_code, room_name, status, game_type, current_question_index')
      .eq('id', roomId)
      .single()

    if (roomError || !room) {
      return NextResponse.json(
        { error: '방을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 퀴즈 문제 수 조회
    const { count: totalQuestions } = await supabaseAdmin
      .from('quiz_questions')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId)

    // 현재 문제 조회 (게임 진행 중인 경우)
    let currentQuestion = null
    if (room.status === 'in_progress' && room.current_question_index !== null) {
      const { data: question } = await supabaseAdmin
        .from('quiz_questions')
        .select('id, question_text, question_type, options, time_limit, points, order_num')
        .eq('room_id', roomId)
        .eq('order_num', room.current_question_index)
        .single()

      currentQuestion = question
    }

    return NextResponse.json({
      room: {
        id: room.id,
        room_code: room.room_code,
        room_name: room.room_name,
        status: room.status,
        game_type: room.game_type,
        current_question_index: room.current_question_index
      },
      total_questions: totalQuestions || 0,
      current_question: currentQuestion
    })
  } catch (error) {
    console.error('퀴즈 상태 조회 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// POST /api/games/quiz/status - 다음 문제로 이동 또는 게임 종료 (강사 전용)
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
    const { room_id, action } = body // action: 'next', 'start', 'end'

    if (!room_id || !action) {
      return NextResponse.json(
        { error: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      )
    }

    if (!['next', 'start', 'end'].includes(action)) {
      return NextResponse.json(
        { error: '유효하지 않은 액션입니다.' },
        { status: 400 }
      )
    }

    // 방 소유권 확인
    const { data: room, error: roomError } = await supabaseAdmin
      .from('game_rooms')
      .select('id, instructor_id, status, current_question_index')
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
        { error: '이 방을 제어할 권한이 없습니다.' },
        { status: 403 }
      )
    }

    // 퀴즈 문제 수 조회
    const { count: totalQuestions } = await supabaseAdmin
      .from('quiz_questions')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room_id)

    if (!totalQuestions || totalQuestions === 0) {
      return NextResponse.json(
        { error: '퀴즈 문제가 없습니다.' },
        { status: 400 }
      )
    }

    let updateData: Record<string, unknown> = {}

    if (action === 'start') {
      // 게임 시작
      if (room.status !== 'waiting') {
        return NextResponse.json(
          { error: '대기 중인 방만 시작할 수 있습니다.' },
          { status: 400 }
        )
      }
      updateData = {
        status: 'in_progress',
        current_question_index: 1,
        started_at: new Date().toISOString()
      }
    } else if (action === 'next') {
      // 다음 문제로
      if (room.status !== 'in_progress') {
        return NextResponse.json(
          { error: '진행 중인 게임만 다음 문제로 넘어갈 수 있습니다.' },
          { status: 400 }
        )
      }

      const nextIndex = (room.current_question_index || 0) + 1
      if (nextIndex > totalQuestions) {
        // 마지막 문제였으면 게임 종료
        updateData = {
          status: 'finished',
          current_question_index: null,
          ended_at: new Date().toISOString()
        }
      } else {
        updateData = {
          current_question_index: nextIndex
        }
      }
    } else if (action === 'end') {
      // 게임 강제 종료
      updateData = {
        status: 'finished',
        current_question_index: null,
        ended_at: new Date().toISOString()
      }
    }

    // 방 상태 업데이트
    const { data: updatedRoom, error: updateError } = await supabaseAdmin
      .from('game_rooms')
      .update(updateData)
      .eq('id', room_id)
      .select()
      .single()

    if (updateError) {
      console.error('방 상태 업데이트 오류:', updateError)
      return NextResponse.json(
        { error: '게임 상태 업데이트에 실패했습니다.' },
        { status: 500 }
      )
    }

    // 업데이트된 현재 문제 정보 조회
    let currentQuestion = null
    if (updatedRoom.status === 'in_progress' && updatedRoom.current_question_index) {
      const { data: question } = await supabaseAdmin
        .from('quiz_questions')
        .select('id, question_text, question_type, options, time_limit, points, order_num')
        .eq('room_id', room_id)
        .eq('order_num', updatedRoom.current_question_index)
        .single()

      currentQuestion = question
    }

    return NextResponse.json({
      success: true,
      room: {
        id: updatedRoom.id,
        status: updatedRoom.status,
        current_question_index: updatedRoom.current_question_index
      },
      total_questions: totalQuestions,
      current_question: currentQuestion
    })
  } catch (error) {
    console.error('퀴즈 상태 변경 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
