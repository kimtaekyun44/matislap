import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// POST /api/games/drawing/draw - 그림 데이터 저장 (그리는 사람)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { round_id, participant_id, drawing_data } = body

    if (!round_id || !participant_id || !drawing_data) {
      return NextResponse.json(
        { error: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      )
    }

    // 라운드 정보 조회 및 권한 확인
    const { data: round, error: roundError } = await supabaseAdmin
      .from('drawing_rounds')
      .select('id, drawer_id, status')
      .eq('id', round_id)
      .single()

    if (roundError || !round) {
      return NextResponse.json(
        { error: '라운드를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (round.drawer_id !== participant_id) {
      return NextResponse.json(
        { error: '그림을 그릴 권한이 없습니다.' },
        { status: 403 }
      )
    }

    if (round.status !== 'drawing') {
      return NextResponse.json(
        { error: '그리기 시간이 아닙니다.' },
        { status: 400 }
      )
    }

    // 그림 데이터 저장
    const { error: updateError } = await supabaseAdmin
      .from('drawing_rounds')
      .update({ drawing_data })
      .eq('id', round_id)

    if (updateError) {
      console.error('그림 저장 오류:', updateError)
      return NextResponse.json(
        { error: '그림 저장에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('그림 저장 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// GET /api/games/drawing/draw?round_id=xxx - 그림 데이터 조회 (맞추는 사람들)
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

    const { data: round, error } = await supabaseAdmin
      .from('drawing_rounds')
      .select('id, drawing_data, status')
      .eq('id', roundId)
      .single()

    if (error || !round) {
      return NextResponse.json(
        { error: '라운드를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      drawing_data: round.drawing_data,
      status: round.status
    })
  } catch (error) {
    console.error('그림 조회 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
