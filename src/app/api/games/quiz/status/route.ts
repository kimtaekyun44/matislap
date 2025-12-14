import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

// Service Role 클라이언트 (RLS 우회)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET /api/games/quiz/status?room_id=xxx&participant_id=xxx - 퀴즈 게임 현재 상태 조회
// participant_id가 있으면 개인별 진행 상태, 없으면 전체 진행 상태 (강사용)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get('room_id')
    const participantId = searchParams.get('participant_id')

    if (!roomId) {
      return NextResponse.json(
        { error: '방 ID가 필요합니다.' },
        { status: 400 }
      )
    }

    // 방 정보 조회
    const { data: room, error: roomError } = await supabaseAdmin
      .from('game_rooms')
      .select('id, room_code, room_name, status, game_type')
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

    // 해당 방의 퀴즈 문제 ID 목록 조회
    const { data: questionIds } = await supabaseAdmin
      .from('quiz_questions')
      .select('id')
      .eq('room_id', roomId)

    const questionIdList = questionIds?.map(q => q.id) || []

    // 개인별 진행 상태 조회 (participant_id가 있는 경우)
    let currentQuestion = null
    let answeredCount = 0

    if (room.status === 'in_progress' && participantId && questionIdList.length > 0) {
      // 해당 참가자가 푼 문제 수 조회
      const { count: answered } = await supabaseAdmin
        .from('quiz_answers')
        .select('id', { count: 'exact', head: true })
        .eq('participant_id', participantId)
        .in('question_id', questionIdList)

      answeredCount = answered || 0
      const nextQuestionIndex = answeredCount + 1

      // 아직 풀 문제가 있으면 다음 문제 조회
      if (nextQuestionIndex <= (totalQuestions || 0)) {
        const { data: question } = await supabaseAdmin
          .from('quiz_questions')
          .select('id, question_text, question_type, options, time_limit, points, order_num')
          .eq('room_id', roomId)
          .eq('order_num', nextQuestionIndex)
          .single()

        currentQuestion = question
      }
    }

    // 강사용: 완료한 참가자 수 조회
    let completedParticipants = 0
    let totalParticipants = 0
    if (!participantId) {
      // 전체 참가자 수
      const { count: total } = await supabaseAdmin
        .from('game_participants')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId)
        .eq('is_active', true)

      totalParticipants = total || 0

      // 모든 문제를 푼 참가자 수
      if (totalQuestions && totalQuestions > 0 && questionIdList.length > 0) {
        const { data: participants } = await supabaseAdmin
          .from('game_participants')
          .select('id')
          .eq('room_id', roomId)
          .eq('is_active', true)

        if (participants) {
          for (const p of participants) {
            const { count: answered } = await supabaseAdmin
              .from('quiz_answers')
              .select('id', { count: 'exact', head: true })
              .eq('participant_id', p.id)
              .in('question_id', questionIdList)

            if ((answered || 0) >= totalQuestions) {
              completedParticipants++
            }
          }
        }
      }
    }

    return NextResponse.json({
      room: {
        id: room.id,
        room_code: room.room_code,
        room_name: room.room_name,
        status: room.status,
        game_type: room.game_type
      },
      total_questions: totalQuestions || 0,
      current_question: currentQuestion,
      answered_count: answeredCount,
      completed_participants: completedParticipants,
      total_participants: totalParticipants
    })
  } catch (error) {
    console.error('퀴즈 상태 조회 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// POST /api/games/quiz/status - 게임 시작 또는 종료 (강사 전용)
// 개인별 진행 방식이므로 'next' 액션은 더 이상 필요 없음
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
    const { room_id, action } = body // action: 'start', 'end'

    if (!room_id || !action) {
      return NextResponse.json(
        { error: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      )
    }

    if (!['start', 'end'].includes(action)) {
      return NextResponse.json(
        { error: '유효하지 않은 액션입니다.' },
        { status: 400 }
      )
    }

    // 방 소유권 확인
    const { data: room, error: roomError } = await supabaseAdmin
      .from('game_rooms')
      .select('id, instructor_id, status')
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

    if (action === 'start' && (!totalQuestions || totalQuestions === 0)) {
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
        started_at: new Date().toISOString()
      }
    } else if (action === 'end') {
      // 게임 종료
      updateData = {
        status: 'finished',
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

    return NextResponse.json({
      success: true,
      room: {
        id: updatedRoom.id,
        status: updatedRoom.status
      },
      total_questions: totalQuestions || 0
    })
  } catch (error) {
    console.error('퀴즈 상태 변경 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
