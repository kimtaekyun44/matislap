import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service Role 클라이언트 (RLS 우회)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// POST /api/games/survey/answer - 설문 답변 제출 (학생)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { question_id, participant_id, answer_text } = body

    if (!question_id || !participant_id || answer_text === undefined || answer_text === '') {
      return NextResponse.json(
        { error: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      )
    }

    // 문항 정보 조회
    const { data: question, error: questionError } = await supabaseAdmin
      .from('survey_questions')
      .select('id, room_id, order_num')
      .eq('id', question_id)
      .single()

    if (questionError || !question) {
      return NextResponse.json(
        { error: '설문 문항을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 참가자 확인
    const { data: participant, error: participantError } = await supabaseAdmin
      .from('game_participants')
      .select('id, is_active')
      .eq('id', participant_id)
      .single()

    if (participantError || !participant) {
      return NextResponse.json(
        { error: '참가자를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (!participant.is_active) {
      return NextResponse.json(
        { error: '비활성 참가자입니다.' },
        { status: 403 }
      )
    }

    // 이미 답변했는지 확인
    const { data: existingAnswer } = await supabaseAdmin
      .from('survey_answers')
      .select('id')
      .eq('question_id', question_id)
      .eq('participant_id', participant_id)
      .single()

    if (existingAnswer) {
      return NextResponse.json(
        { error: '이미 답변을 제출했습니다.' },
        { status: 400 }
      )
    }

    // 답변 저장
    const { data: answer, error: insertError } = await supabaseAdmin
      .from('survey_answers')
      .insert({ question_id, participant_id, answer_text })
      .select()
      .single()

    if (insertError) {
      console.error('설문 답변 저장 오류:', insertError)
      return NextResponse.json(
        { error: '답변 저장에 실패했습니다.' },
        { status: 500 }
      )
    }

    // 자동 진행 로직: 모든 활성 참가자가 답변하면 다음 문항으로 이동
    const roomId = question.room_id

    const { count: activeParticipants } = await supabaseAdmin
      .from('game_participants')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('is_active', true)

    const { count: answersCount } = await supabaseAdmin
      .from('survey_answers')
      .select('*', { count: 'exact', head: true })
      .eq('question_id', question_id)

    if (activeParticipants && answersCount && answersCount >= activeParticipants) {
      const { count: totalQuestions } = await supabaseAdmin
        .from('survey_questions')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomId)

      const currentIndex = question.order_num
      const nextIndex = currentIndex + 1

      if (totalQuestions && nextIndex <= totalQuestions) {
        await supabaseAdmin
          .from('game_rooms')
          .update({ current_question_index: nextIndex })
          .eq('id', roomId)
      }
    }

    return NextResponse.json({ success: true, answer: { id: answer.id } })
  } catch (error) {
    console.error('설문 답변 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// GET /api/games/survey/answer?question_id=xxx - 문항별 답변 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const questionId = searchParams.get('question_id')

    if (!questionId) {
      return NextResponse.json(
        { error: '문항 ID가 필요합니다.' },
        { status: 400 }
      )
    }

    const { data: answers, error } = await supabaseAdmin
      .from('survey_answers')
      .select(`
        id,
        answer_text,
        created_at,
        game_participants (
          id,
          nickname
        )
      `)
      .eq('question_id', questionId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('설문 답변 조회 오류:', error)
      return NextResponse.json(
        { error: '답변을 불러오는데 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ answers })
  } catch (error) {
    console.error('설문 답변 조회 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
