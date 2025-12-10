import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// POST /api/games/drawing/guess - 정답 추측 제출
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { round_id, participant_id, guess_text } = body

    if (!round_id || !participant_id || !guess_text?.trim()) {
      return NextResponse.json(
        { error: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      )
    }

    // 라운드 정보 조회
    const { data: round, error: roundError } = await supabaseAdmin
      .from('drawing_rounds')
      .select(`
        id,
        drawer_id,
        status,
        drawing_words (word)
      `)
      .eq('id', round_id)
      .single()

    if (roundError || !round) {
      return NextResponse.json(
        { error: '라운드를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 그리는 사람은 추측 불가
    if (round.drawer_id === participant_id) {
      return NextResponse.json(
        { error: '그리는 사람은 정답을 맞출 수 없습니다.' },
        { status: 400 }
      )
    }

    if (round.status !== 'drawing') {
      return NextResponse.json(
        { error: '추측 시간이 아닙니다.' },
        { status: 400 }
      )
    }

    // 이미 정답을 맞췄는지 확인
    const { data: existingCorrect } = await supabaseAdmin
      .from('drawing_guesses')
      .select('id')
      .eq('round_id', round_id)
      .eq('participant_id', participant_id)
      .eq('is_correct', true)
      .single()

    if (existingCorrect) {
      return NextResponse.json(
        { error: '이미 정답을 맞추셨습니다.' },
        { status: 400 }
      )
    }

    // 정답 확인 (대소문자, 공백 무시)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wordData = round.drawing_words as any
    const correctAnswer = (wordData?.word || '').toLowerCase().trim().replace(/\s+/g, '')
    const userGuess = guess_text.toLowerCase().trim().replace(/\s+/g, '')
    const isCorrect = correctAnswer === userGuess

    // 점수 계산 (정답 시)
    let pointsEarned = 0
    if (isCorrect) {
      // 정답자 수에 따라 점수 차등 (1등: 100점, 2등: 80점, ...)
      const { count: correctCount } = await supabaseAdmin
        .from('drawing_guesses')
        .select('*', { count: 'exact', head: true })
        .eq('round_id', round_id)
        .eq('is_correct', true)

      const rank = (correctCount || 0) + 1
      pointsEarned = Math.max(100 - (rank - 1) * 20, 20) // 최소 20점
    }

    // 추측 저장
    const { data: guess, error: insertError } = await supabaseAdmin
      .from('drawing_guesses')
      .insert({
        round_id,
        participant_id,
        guess_text: guess_text.trim(),
        is_correct: isCorrect,
        points_earned: pointsEarned
      })
      .select()
      .single()

    if (insertError) {
      // 중복 추측인 경우
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: '이미 같은 추측을 하셨습니다.' },
          { status: 400 }
        )
      }
      console.error('추측 저장 오류:', insertError)
      return NextResponse.json(
        { error: '추측 저장에 실패했습니다.' },
        { status: 500 }
      )
    }

    // 정답 시 참가자 점수 업데이트
    if (isCorrect && pointsEarned > 0) {
      const { data: participant } = await supabaseAdmin
        .from('game_participants')
        .select('score')
        .eq('id', participant_id)
        .single()

      if (participant) {
        await supabaseAdmin
          .from('game_participants')
          .update({ score: (participant.score || 0) + pointsEarned })
          .eq('id', participant_id)
      }

      // 그린 사람에게도 점수 부여 (정답자 1명당 30점)
      const { data: drawer } = await supabaseAdmin
        .from('game_participants')
        .select('score')
        .eq('id', round.drawer_id)
        .single()

      if (drawer) {
        await supabaseAdmin
          .from('game_participants')
          .update({ score: (drawer.score || 0) + 30 })
          .eq('id', round.drawer_id)
      }
    }

    return NextResponse.json({
      success: true,
      guess: {
        id: guess.id,
        is_correct: isCorrect,
        points_earned: pointsEarned
      },
      correct_answer: isCorrect ? wordData?.word : undefined
    })
  } catch (error) {
    console.error('추측 제출 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// GET /api/games/drawing/guess?round_id=xxx - 라운드 추측 결과 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const roundId = searchParams.get('round_id')

    if (!roundId) {
      return NextResponse.json(
        { error: '라운드 ID가 필요합니다.' },
        { status: 400 }
      )
    }

    const { data: guesses, error } = await supabaseAdmin
      .from('drawing_guesses')
      .select(`
        id,
        guess_text,
        is_correct,
        points_earned,
        guessed_at,
        game_participants (id, nickname)
      `)
      .eq('round_id', roundId)
      .order('guessed_at', { ascending: true })

    if (error) {
      console.error('추측 조회 오류:', error)
      return NextResponse.json(
        { error: '추측 조회에 실패했습니다.' },
        { status: 500 }
      )
    }

    // 정답자 수
    const correctGuesses = guesses?.filter(g => g.is_correct) || []

    return NextResponse.json({
      guesses: guesses || [],
      stats: {
        total_guesses: guesses?.length || 0,
        correct_count: correctGuesses.length
      }
    })
  } catch (error) {
    console.error('추측 조회 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
