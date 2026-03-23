import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET /api/games/jeopardy/state?room_id=xxx
// 폴링용: 현재 제퍼디 게임 상태 반환
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get('room_id')

    if (!roomId) {
      return NextResponse.json({ error: '방 ID가 필요합니다.' }, { status: 400 })
    }

    // 방 상태 + 현재 문제 ID + 버저 당첨자 ID 조회
    const { data: room, error: roomError } = await supabase
      .from('game_rooms')
      .select('id, status, current_jeopardy_question_id, jeopardy_buzzer_winner_id, jeopardy_buzzer_answer')
      .eq('id', roomId)
      .single()

    if (roomError || !room) {
      return NextResponse.json({ error: '방을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 현재 문제 조회
    let currentQuestion = null
    if (room.current_jeopardy_question_id) {
      const { data: q } = await supabase
        .from('jeopardy_questions')
        .select('id, category, points, content, answer, question_type, options, is_used')
        .eq('id', room.current_jeopardy_question_id)
        .single()
      currentQuestion = q
    }

    // 버저 당첨자 조회
    let buzzerWinner = null
    if (room.jeopardy_buzzer_winner_id) {
      const { data: p } = await supabase
        .from('game_participants')
        .select('id, nickname, score')
        .eq('id', room.jeopardy_buzzer_winner_id)
        .single()
      buzzerWinner = p
    }

    // 참가자 점수 목록 (스코어보드용)
    const { data: participants } = await supabase
      .from('game_participants')
      .select('id, nickname, score, is_active')
      .eq('room_id', roomId)
      .eq('is_active', true)
      .order('score', { ascending: false })

    return NextResponse.json({
      room_status: room.status,
      current_question: currentQuestion,
      buzzer_winner: buzzerWinner,
      buzzer_answer: room.jeopardy_buzzer_answer ?? null,
      participants: participants || [],
    })
  } catch (error) {
    console.error('제퍼디 state API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
