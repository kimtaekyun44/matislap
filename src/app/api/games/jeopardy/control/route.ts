import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// POST /api/games/jeopardy/control
// action: 'start' | 'end' | 'select_question' | 'judge' | 'clear_question'
export async function POST(request: NextRequest) {
  try {
    const session = await getInstructorSession()
    if (!session) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const body = await request.json()
    const { action, room_id, question_id, participant_id, is_correct } = body

    if (!action || !room_id) {
      return NextResponse.json({ error: '필수 데이터가 누락되었습니다.' }, { status: 400 })
    }

    // 방 소유 확인
    const { data: room, error: roomError } = await supabase
      .from('game_rooms')
      .select('id, instructor_id, status, game_type')
      .eq('id', room_id)
      .single()

    if (roomError || !room) {
      return NextResponse.json({ error: '방을 찾을 수 없습니다.' }, { status: 404 })
    }
    if (room.instructor_id !== session.instructorId) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }
    if (room.game_type !== 'jeopardy') {
      return NextResponse.json({ error: '제퍼디 게임방이 아닙니다.' }, { status: 400 })
    }

    if (action === 'start') {
      if (room.status !== 'waiting') {
        return NextResponse.json({ error: '대기 상태에서만 시작할 수 있습니다.' }, { status: 400 })
      }
      const { error } = await supabase
        .from('game_rooms')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString(),
          current_jeopardy_question_id: null,
          jeopardy_buzzer_winner_id: null,
        })
        .eq('id', room_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (action === 'end') {
      if (room.status !== 'in_progress') {
        return NextResponse.json({ error: '진행 중인 게임만 종료할 수 있습니다.' }, { status: 400 })
      }
      const { error } = await supabase
        .from('game_rooms')
        .update({
          status: 'finished',
          ended_at: new Date().toISOString(),
          current_jeopardy_question_id: null,
          jeopardy_buzzer_winner_id: null,
        })
        .eq('id', room_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (action === 'select_question') {
      if (room.status !== 'in_progress') {
        return NextResponse.json({ error: '진행 중인 게임에서만 문제를 선택할 수 있습니다.' }, { status: 400 })
      }
      if (!question_id) {
        return NextResponse.json({ error: 'question_id가 필요합니다.' }, { status: 400 })
      }
      const { error } = await supabase
        .from('game_rooms')
        .update({
          current_jeopardy_question_id: question_id,
          jeopardy_buzzer_winner_id: null,
          jeopardy_buzzer_answer: null,
        })
        .eq('id', room_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (action === 'judge') {
      // 버저 당첨자 정답/오답 판정
      if (!question_id || !participant_id || is_correct === undefined) {
        return NextResponse.json({ error: 'question_id, participant_id, is_correct가 필요합니다.' }, { status: 400 })
      }

      // 문제 점수 조회
      const { data: question, error: qError } = await supabase
        .from('jeopardy_questions')
        .select('points')
        .eq('id', question_id)
        .single()
      if (qError || !question) {
        return NextResponse.json({ error: '문제를 찾을 수 없습니다.' }, { status: 404 })
      }

      // 버저 로그 기록
      await supabase
        .from('jeopardy_buzzer_log')
        .insert({
          room_id,
          question_id,
          participant_id,
          is_correct,
        })

      if (is_correct) {
        // 정답: 점수 추가 + 문제 used 처리 + 버저/문제 초기화
        const { data: participant } = await supabase
          .from('game_participants')
          .select('score')
          .eq('id', participant_id)
          .single()

        await supabase
          .from('game_participants')
          .update({ score: (participant?.score || 0) + question.points })
          .eq('id', participant_id)

        await supabase
          .from('jeopardy_questions')
          .update({ is_used: true })
          .eq('id', question_id)

        await supabase
          .from('game_rooms')
          .update({
            current_jeopardy_question_id: null,
            jeopardy_buzzer_winner_id: null,
            jeopardy_buzzer_answer: null,
          })
          .eq('id', room_id)
      } else {
        // 오답: 점수 차감 + 버저만 초기화 (문제는 유지, 다른 사람이 다시 버저 가능)
        const { data: participant } = await supabase
          .from('game_participants')
          .select('score')
          .eq('id', participant_id)
          .single()

        await supabase
          .from('game_participants')
          .update({ score: (participant?.score || 0) - question.points })
          .eq('id', participant_id)

        await supabase
          .from('game_rooms')
          .update({ jeopardy_buzzer_winner_id: null, jeopardy_buzzer_answer: null })
          .eq('id', room_id)
      }

      return NextResponse.json({ success: true, points: question.points, is_correct })
    }

    if (action === 'clear_question') {
      // 문제를 닫고 보드로 돌아가기 (버저 없이 문제 패스)
      const { error } = await supabase
        .from('game_rooms')
        .update({
          current_jeopardy_question_id: null,
          jeopardy_buzzer_winner_id: null,
          jeopardy_buzzer_answer: null,
        })
        .eq('id', room_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: '알 수 없는 액션입니다.' }, { status: 400 })
  } catch (error) {
    console.error('제퍼디 control API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
