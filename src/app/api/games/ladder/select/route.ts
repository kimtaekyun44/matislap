import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET: 현재 선택 현황 조회
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const roomId = searchParams.get('room_id')

  if (!roomId) {
    return NextResponse.json({ error: 'room_id가 필요합니다.' }, { status: 400 })
  }

  const { data: selections, error } = await supabaseAdmin
    .from('ladder_selections')
    .select(`
      *,
      game_participants (nickname)
    `)
    .eq('room_id', roomId)
    .order('start_position', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 사다리 데이터 조회 (lines_count 필요)
  const { data: ladderData } = await supabaseAdmin
    .from('ladder_data')
    .select('lines_count')
    .eq('room_id', roomId)
    .single()

  return NextResponse.json({
    selections: selections || [],
    lines_count: ladderData?.lines_count || 0,
  })
}

// POST: 참가자가 출발점 선택
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { room_id, participant_id, start_position } = body

  if (!room_id || !participant_id || start_position === undefined) {
    return NextResponse.json(
      { error: 'room_id, participant_id, start_position이 필요합니다.' },
      { status: 400 }
    )
  }

  // 방 상태 확인
  const { data: room } = await supabaseAdmin
    .from('game_rooms')
    .select('status')
    .eq('id', room_id)
    .single()

  if (!room || room.status !== 'in_progress') {
    return NextResponse.json({ error: '게임이 진행 중이 아닙니다.' }, { status: 400 })
  }

  // 사다리 데이터 확인
  const { data: ladderData } = await supabaseAdmin
    .from('ladder_data')
    .select('lines_count')
    .eq('room_id', room_id)
    .single()

  if (!ladderData) {
    return NextResponse.json({ error: '사다리가 생성되지 않았습니다.' }, { status: 400 })
  }

  // 유효한 position인지 확인
  if (start_position < 0 || start_position >= ladderData.lines_count) {
    return NextResponse.json({ error: '유효하지 않은 위치입니다.' }, { status: 400 })
  }

  // 이미 선택한 참가자인지 확인
  const { data: existingSelection } = await supabaseAdmin
    .from('ladder_selections')
    .select('id')
    .eq('room_id', room_id)
    .eq('participant_id', participant_id)
    .single()

  if (existingSelection) {
    return NextResponse.json({ error: '이미 선택하셨습니다.' }, { status: 400 })
  }

  // 이미 선택된 위치인지 확인
  const { data: positionTaken } = await supabaseAdmin
    .from('ladder_selections')
    .select('id')
    .eq('room_id', room_id)
    .eq('start_position', start_position)
    .single()

  if (positionTaken) {
    return NextResponse.json({ error: '이미 선택된 위치입니다.' }, { status: 400 })
  }

  // 선택 저장
  const { data, error } = await supabaseAdmin
    .from('ladder_selections')
    .insert({
      room_id,
      participant_id,
      start_position,
    })
    .select()
    .single()

  if (error) {
    // unique constraint violation
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 선택된 위치입니다.' }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ selection: data })
}
