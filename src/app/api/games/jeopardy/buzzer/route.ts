import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// POST /api/games/jeopardy/buzzer
// 학생이 버저를 누를 때 호출 - 원자적 업데이트로 선점
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { room_id, participant_id, question_id } = body

    if (!room_id || !participant_id || !question_id) {
      return NextResponse.json({ error: '필수 데이터가 누락되었습니다.' }, { status: 400 })
    }

    // 원자적 업데이트: buzzer_winner_id가 null인 경우에만 업데이트
    // 현재 문제가 일치하는 경우에만 버저 선점 가능
    const { data, error } = await supabase
      .from('game_rooms')
      .update({ jeopardy_buzzer_winner_id: participant_id })
      .eq('id', room_id)
      .eq('current_jeopardy_question_id', question_id)
      .is('jeopardy_buzzer_winner_id', null)
      .select('jeopardy_buzzer_winner_id')

    if (error) {
      console.error('버저 업데이트 오류:', error)
      return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }

    // 업데이트된 행이 있으면 선점 성공
    const won = data && data.length > 0 && data[0].jeopardy_buzzer_winner_id === participant_id

    return NextResponse.json({ success: true, won })
  } catch (error) {
    console.error('버저 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

// PATCH /api/games/jeopardy/buzzer
// 버저 선점 후 답변 제출
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { room_id, participant_id, answer } = body

    if (!room_id || !participant_id || answer === undefined) {
      return NextResponse.json({ error: '필수 데이터가 누락되었습니다.' }, { status: 400 })
    }

    // 본인이 버저 선점자인 경우에만 답변 제출 가능
    const { error } = await supabase
      .from('game_rooms')
      .update({ jeopardy_buzzer_answer: answer })
      .eq('id', room_id)
      .eq('jeopardy_buzzer_winner_id', participant_id)

    if (error) {
      console.error('답변 제출 오류:', error)
      return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('답변 제출 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
