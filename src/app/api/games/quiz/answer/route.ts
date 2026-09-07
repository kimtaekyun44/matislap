import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service Role 클라이언트 (RLS 우회)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// POST /api/games/quiz/answer - 퀴즈 답변 제출 (학생)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { question_id, participant_id, selected_answer, answer_time_ms } = body

    // 필수 필드 검증
    if (!question_id || !participant_id || selected_answer === undefined) {
      return NextResponse.json(
        { error: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      )
    }

    // 문제 정보 조회
    const { data: question, error: questionError } = await supabaseAdmin
      .from('quiz_questions')
      .select('correct_answer, points, time_limit')
      .eq('id', question_id)
      .single()

    if (questionError || !question) {
      return NextResponse.json(
        { error: '퀴즈 문제를 찾을 수 없습니다.' },
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
      .from('quiz_answers')
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

    // 정답 여부 확인
    const isCorrect = selected_answer === question.correct_answer

    // 점수 계산
    let pointsEarned = 0
    if (isCorrect) {
      pointsEarned = question.points
      // [주석처리] 시간 보너스 기능 - 빠르게 답변할수록 최대 50% 추가 점수
      // if (answer_time_ms && question.time_limit) {
      //   const maxTime = question.time_limit * 1000 // ms로 변환
      //   const timeBonus = Math.max(0, 1 - (answer_time_ms / maxTime)) * 0.5
      //   pointsEarned = Math.round(pointsEarned * (1 + timeBonus))
      // }
    }

    // 답변 저장
    const { data: answer, error: insertError } = await supabaseAdmin
      .from('quiz_answers')
      .insert({
        question_id,
        participant_id,
        selected_answer,
        is_correct: isCorrect,
        answer_time_ms: answer_time_ms || null,
        points_earned: pointsEarned
      })
      .select()
      .single()

    if (insertError) {
      console.error('답변 저장 오류:', insertError)
      return NextResponse.json(
        { error: '답변 저장에 실패했습니다.' },
        { status: 500 }
      )
    }

    // 참가자 총 점수 업데이트
    if (pointsEarned > 0) {
      const { error: scoreError } = await supabaseAdmin.rpc('increment_participant_score', {
        p_participant_id: participant_id,
        p_points: pointsEarned
      })

      // RPC 함수가 없으면 직접 업데이트
      if (scoreError) {
        const { data: currentParticipant } = await supabaseAdmin
          .from('game_participants')
          .select('score')
          .eq('id', participant_id)
          .single()

        if (currentParticipant) {
          await supabaseAdmin
            .from('game_participants')
            .update({ score: (currentParticipant.score || 0) + pointsEarned })
            .eq('id', participant_id)
        }
      }
    }

    // 참고: 예전에는 모든 참가자가 답하면 game_rooms.current_question_index 를
    // 올려 전체 진행을 맞췄지만, 개인별 진행으로 바뀌면서 그 값을 읽는 곳이
    // 없어져 제거했다. 다음 문제는 quiz/status 가 참가자별로 계산한다.

    return NextResponse.json({
      success: true,
      answer: {
        id: answer.id,
        is_correct: isCorrect,
        points_earned: pointsEarned,
        correct_answer: question.correct_answer
      }
    })
  } catch (error) {
    console.error('답변 제출 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// GET /api/games/quiz/answer?question_id=xxx - 문제별 답변 결과 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const questionId = searchParams.get('question_id')

    if (!questionId) {
      return NextResponse.json(
        { error: '문제 ID가 필요합니다.' },
        { status: 400 }
      )
    }

    // 답변 목록과 참가자 정보 조회
    const { data: answers, error } = await supabaseAdmin
      .from('quiz_answers')
      .select(`
        id,
        selected_answer,
        is_correct,
        answer_time_ms,
        points_earned,
        created_at,
        game_participants (
          id,
          nickname
        )
      `)
      .eq('question_id', questionId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('답변 조회 오류:', error)
      return NextResponse.json(
        { error: '답변을 불러오는데 실패했습니다.' },
        { status: 500 }
      )
    }

    // 통계 계산
    const totalAnswers = answers.length
    const correctAnswers = answers.filter(a => a.is_correct).length
    const averageTime = answers.length > 0
      ? Math.round(answers.reduce((sum, a) => sum + (a.answer_time_ms || 0), 0) / answers.length)
      : 0

    return NextResponse.json({
      answers,
      stats: {
        total: totalAnswers,
        correct: correctAnswers,
        incorrect: totalAnswers - correctAnswers,
        accuracy: totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0,
        average_time_ms: averageTime
      }
    })
  } catch (error) {
    console.error('답변 조회 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
