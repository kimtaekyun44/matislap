import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'
import {
  buildDistribution,
  summarizeAnswers,
  type QuizAnswerRecord,
} from '@/lib/games/quiz-stats'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// 조인 결과는 관계 설정에 따라 객체 또는 배열로 오므로 양쪽 모두 처리한다
type JoinedParticipant = { nickname: string | null } | { nickname: string | null }[] | null

interface RawAnswer {
  question_id: string
  selected_answer: string | null
  is_correct: boolean | null
  answer_time_ms: number | null
  game_participants: JoinedParticipant
}

const extractNickname = (joined: JoinedParticipant): string => {
  if (!joined) return '알 수 없음'
  const participant = Array.isArray(joined) ? joined[0] : joined
  return participant?.nickname || '알 수 없음'
}

// GET /api/games/quiz/stats?room_id=xxx - 방 전체 퀴즈 응답 통계 (강사 전용)
export async function GET(request: NextRequest) {
  try {
    const session = await getInstructorSession()
    if (!session) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get('room_id')

    if (!roomId) {
      return NextResponse.json(
        { error: '방 ID가 필요합니다.' },
        { status: 400 }
      )
    }

    // 방 소유권 확인
    const { data: room, error: roomError } = await supabaseAdmin
      .from('game_rooms')
      .select('id, instructor_id')
      .eq('id', roomId)
      .single()

    if (roomError || !room) {
      return NextResponse.json(
        { error: '방을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (room.instructor_id !== session.instructorId) {
      return NextResponse.json(
        { error: '이 방의 통계를 조회할 권한이 없습니다.' },
        { status: 403 }
      )
    }

    const { data: questions, error: questionsError } = await supabaseAdmin
      .from('quiz_questions')
      .select('id, question_text, question_type, options, correct_answer, order_num')
      .eq('room_id', roomId)
      .order('order_num', { ascending: true })

    if (questionsError) {
      console.error('퀴즈 문제 조회 오류:', questionsError)
      return NextResponse.json(
        { error: '문제를 불러오는데 실패했습니다.' },
        { status: 500 }
      )
    }

    // 참가자 수 (미응답 인원 계산용)
    const { count: participantCount } = await supabaseAdmin
      .from('game_participants')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId)

    const questionIds = (questions || []).map((question) => question.id)

    // 답변을 한 번에 가져와 메모리에서 문제별로 나눈다 (문제 수만큼 쿼리하지 않기 위함)
    let answers: RawAnswer[] = []
    if (questionIds.length > 0) {
      const { data, error: answersError } = await supabaseAdmin
        .from('quiz_answers')
        .select(`
          question_id,
          selected_answer,
          is_correct,
          answer_time_ms,
          game_participants ( nickname )
        `)
        .in('question_id', questionIds)
        .order('created_at', { ascending: true })

      if (answersError) {
        console.error('퀴즈 답변 조회 오류:', answersError)
        return NextResponse.json(
          { error: '답변을 불러오는데 실패했습니다.' },
          { status: 500 }
        )
      }

      answers = (data || []) as unknown as RawAnswer[]
    }

    const answersByQuestion = new Map<string, QuizAnswerRecord[]>()
    for (const answer of answers) {
      const list = answersByQuestion.get(answer.question_id) || []
      list.push({
        selected_answer: answer.selected_answer,
        is_correct: answer.is_correct,
        answer_time_ms: answer.answer_time_ms,
        nickname: extractNickname(answer.game_participants),
      })
      answersByQuestion.set(answer.question_id, list)
    }

    const totalParticipants = participantCount || 0

    const result = (questions || []).map((question) => {
      const questionAnswers = answersByQuestion.get(question.id) || []
      const summary = summarizeAnswers(questionAnswers)

      return {
        id: question.id,
        order_num: question.order_num,
        question_text: question.question_text,
        question_type: question.question_type,
        correct_answer: question.correct_answer,
        ...summary,
        // 응답하지 않은 인원은 정답률 분모에서 제외하고 별도로 센다
        unanswered_count: Math.max(0, totalParticipants - summary.total_answers),
        distribution: buildDistribution(
          question.options,
          question.correct_answer,
          questionAnswers
        ),
      }
    })

    // 전체 평균 정답률은 응답이 있는 문제만 대상으로 한다
    const answeredQuestions = result.filter((item) => item.total_answers > 0)
    const overallAccuracy =
      answeredQuestions.length > 0
        ? Math.round(
            answeredQuestions.reduce((sum, item) => sum + item.accuracy, 0) /
              answeredQuestions.length
          )
        : 0

    return NextResponse.json({
      questions: result,
      participant_count: totalParticipants,
      overall_accuracy: overallAccuracy,
    })
  } catch (error) {
    console.error('퀴즈 통계 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
