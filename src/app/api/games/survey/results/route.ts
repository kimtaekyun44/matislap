import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service Role 클라이언트 (RLS 우회)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET /api/games/survey/results?room_id=xxx - 결과 데이터프레임 조회 (행=학생, 열=문항)
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

    // 설문 문항 목록 조회
    const { data: questions, error: questionsError } = await supabaseAdmin
      .from('survey_questions')
      .select('id, question_text, question_type, options, order_num')
      .eq('room_id', roomId)
      .order('order_num', { ascending: true })

    if (questionsError) {
      console.error('설문 문항 조회 오류:', questionsError)
      return NextResponse.json(
        { error: '설문 문항을 불러오는데 실패했습니다.' },
        { status: 500 }
      )
    }

    // 참가자 목록 조회
    const { data: participants, error: participantsError } = await supabaseAdmin
      .from('game_participants')
      .select('id, nickname')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true })

    if (participantsError) {
      console.error('참가자 조회 오류:', participantsError)
      return NextResponse.json(
        { error: '참가자를 불러오는데 실패했습니다.' },
        { status: 500 }
      )
    }

    if (!questions || questions.length === 0 || !participants || participants.length === 0) {
      return NextResponse.json({
        questions: questions || [],
        rows: []
      })
    }

    // 모든 답변 조회
    const questionIdList = questions.map(q => q.id)
    const { data: answers, error: answersError } = await supabaseAdmin
      .from('survey_answers')
      .select('question_id, participant_id, answer_text')
      .in('question_id', questionIdList)

    if (answersError) {
      console.error('설문 답변 조회 오류:', answersError)
      return NextResponse.json(
        { error: '답변을 불러오는데 실패했습니다.' },
        { status: 500 }
      )
    }

    // 답변을 Map으로 인덱싱 (participant_id:question_id -> answer_text)
    const answerMap = new Map<string, string>()
    for (const a of answers || []) {
      answerMap.set(`${a.participant_id}:${a.question_id}`, a.answer_text)
    }

    // 행(학생) × 열(문항) 형태로 변환
    const rows = participants.map(p => ({
      participant_id: p.id,
      nickname: p.nickname,
      answers: Object.fromEntries(
        questions.map(q => [q.id, answerMap.get(`${p.id}:${q.id}`) ?? ''])
      )
    }))

    return NextResponse.json({ questions, rows })
  } catch (error) {
    console.error('설문 결과 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
