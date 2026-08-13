import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

interface HorizontalLine {
  row: number
  fromCol: number
}

// 사다리 생성 알고리즘
function generateLadder(linesCount: number, density: number = 0.4): HorizontalLine[] {
  const rows = 10
  const horizontalLines: HorizontalLine[] = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < linesCount - 1; col++) {
      if (Math.random() < density) {
        // 연속된 가로선 방지
        const hasLeft = horizontalLines.some(l => l.row === row && l.fromCol === col - 1)
        if (!hasLeft) {
          horizontalLines.push({ row, fromCol: col })
        }
      }
    }
  }

  return horizontalLines
}

// 사다리 결과 계산
function calculateResult(startCol: number, horizontalLines: HorizontalLine[]): number {
  let col = startCol
  const rows = 10

  for (let row = 0; row < rows; row++) {
    // 오른쪽으로 가는 가로선
    const rightLine = horizontalLines.find(l => l.row === row && l.fromCol === col)
    if (rightLine) {
      col++
      continue
    }

    // 왼쪽으로 오는 가로선
    const leftLine = horizontalLines.find(l => l.row === row && l.fromCol === col - 1)
    if (leftLine) {
      col--
    }
  }

  return col
}

// GET: 게임 상태 조회
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const roomId = searchParams.get('room_id')

  if (!roomId) {
    return NextResponse.json({ error: 'room_id가 필요합니다.' }, { status: 400 })
  }

  // 사다리 데이터 조회
  const { data: ladderData } = await supabaseAdmin
    .from('ladder_data')
    .select('*')
    .eq('room_id', roomId)
    .single()

  // 선택 현황 조회
  const { data: selections } = await supabaseAdmin
    .from('ladder_selections')
    .select(`
      *,
      game_participants (nickname)
    `)
    .eq('room_id', roomId)
    .order('start_position', { ascending: true })

  // 결과 항목 조회
  const { data: items } = await supabaseAdmin
    .from('ladder_items')
    .select('*')
    .eq('room_id', roomId)
    .order('position', { ascending: true })

  return NextResponse.json({
    ladder_data: ladderData,
    selections: selections || [],
    items: items || [],
  })
}

// POST: 게임 액션
export async function POST(request: NextRequest) {
  const session = await getInstructorSession()
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const body = await request.json()
  const { room_id, action, participant_id } = body

  if (!room_id || !action) {
    return NextResponse.json({ error: 'room_id와 action이 필요합니다.' }, { status: 400 })
  }

  // 방 조회 및 권한 확인
  const { data: room } = await supabaseAdmin
    .from('game_rooms')
    .select('*')
    .eq('id', room_id)
    .single()

  if (!room || room.instructor_id !== session.instructorId) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  if (action === 'start') {
    // 이전 게임에서 자동 생성된 항목은 먼저 걷어낸다 (재시작 시 누적 방지)
    await supabaseAdmin
      .from('ladder_items')
      .delete()
      .eq('room_id', room_id)
      .eq('is_auto', true)

    // 강사가 직접 등록한 당첨 항목
    const { data: manualItems } = await supabaseAdmin
      .from('ladder_items')
      .select('id, position')
      .eq('room_id', room_id)
      .order('position', { ascending: true })

    if (!manualItems || manualItems.length < 1) {
      return NextResponse.json({ error: '최소 1개의 결과 항목이 필요합니다.' }, { status: 400 })
    }

    // 항목 삭제로 position에 구멍이 생겼을 수 있으므로 0부터 다시 붙인다.
    // (구멍이 있으면 도착 지점에 해당하는 항목을 찾지 못해 결과가 '???'로 표시됨)
    for (let i = 0; i < manualItems.length; i++) {
      if (manualItems[i].position !== i) {
        await supabaseAdmin
          .from('ladder_items')
          .update({ position: i })
          .eq('id', manualItems[i].id)
      }
    }

    // 실제 입장한 참가자 수만큼 줄을 만든다
    const { count: participantCount } = await supabaseAdmin
      .from('game_participants')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room_id)
      .eq('is_active', true)

    // 참가자가 항목보다 적으면 항목 수를 그대로 쓴다 (항목을 임의로 버리지 않음)
    const linesCount = Math.max(manualItems.length, participantCount || 0)

    // 부족한 만큼 "다음 기회에" 항목을 채운다
    const fillCount = linesCount - manualItems.length
    if (fillCount > 0) {
      const fillItems = Array.from({ length: fillCount }, (_, i) => ({
        room_id,
        item_text: '다음 기회에',
        position: manualItems.length + i,
        is_auto: true,
      }))

      const { error: fillError } = await supabaseAdmin
        .from('ladder_items')
        .insert(fillItems)

      if (fillError) {
        return NextResponse.json({ error: fillError.message }, { status: 500 })
      }
    }

    // 기존 사다리 데이터 삭제
    await supabaseAdmin.from('ladder_data').delete().eq('room_id', room_id)
    await supabaseAdmin.from('ladder_selections').delete().eq('room_id', room_id)

    // 사다리 생성
    const horizontalLines = generateLadder(linesCount)

    // 사다리 데이터 저장
    const { error: ladderError } = await supabaseAdmin
      .from('ladder_data')
      .insert({
        room_id,
        lines_count: linesCount,
        horizontal_lines: horizontalLines,
      })

    if (ladderError) {
      return NextResponse.json({ error: ladderError.message }, { status: 500 })
    }

    // 방 상태 업데이트
    await supabaseAdmin
      .from('game_rooms')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', room_id)

    return NextResponse.json({
      success: true,
      lines_count: linesCount,
      manual_count: manualItems.length,
      auto_count: fillCount,
    })
  }

  if (action === 'reveal') {
    if (!participant_id) {
      return NextResponse.json({ error: 'participant_id가 필요합니다.' }, { status: 400 })
    }

    // 선택 조회
    const { data: selection } = await supabaseAdmin
      .from('ladder_selections')
      .select('*')
      .eq('room_id', room_id)
      .eq('participant_id', participant_id)
      .single()

    if (!selection) {
      return NextResponse.json({ error: '선택을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (selection.is_revealed) {
      return NextResponse.json({ error: '이미 공개된 결과입니다.' }, { status: 400 })
    }

    // 사다리 데이터 조회
    const { data: ladderData } = await supabaseAdmin
      .from('ladder_data')
      .select('horizontal_lines')
      .eq('room_id', room_id)
      .single()

    if (!ladderData) {
      return NextResponse.json({ error: '사다리 데이터를 찾을 수 없습니다.' }, { status: 404 })
    }

    // 결과 계산
    const resultPosition = calculateResult(
      selection.start_position,
      ladderData.horizontal_lines as HorizontalLine[]
    )

    // 결과 업데이트
    const { error } = await supabaseAdmin
      .from('ladder_selections')
      .update({
        result_position: resultPosition,
        is_revealed: true,
      })
      .eq('id', selection.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, result_position: resultPosition })
  }

  // 당첨 항목을 클릭해 그 자리에 도착한 참가자를 공개한다 (항목 중심 공개)
  if (action === 'reveal_position') {
    const { position } = body

    if (position === undefined || position === null) {
      return NextResponse.json({ error: 'position이 필요합니다.' }, { status: 400 })
    }

    const { data: ladderData } = await supabaseAdmin
      .from('ladder_data')
      .select('horizontal_lines')
      .eq('room_id', room_id)
      .single()

    if (!ladderData) {
      return NextResponse.json({ error: '사다리 데이터를 찾을 수 없습니다.' }, { status: 404 })
    }

    const { data: selections } = await supabaseAdmin
      .from('ladder_selections')
      .select('*, game_participants (nickname)')
      .eq('room_id', room_id)

    if (!selections || selections.length === 0) {
      return NextResponse.json({ error: '아직 선택한 참가자가 없습니다.' }, { status: 400 })
    }

    const lines = ladderData.horizontal_lines as HorizontalLine[]

    // 도착 지점이 이 항목인 참가자를 찾는다 (사다리는 1:1 대응이라 최대 한 명)
    const winner = selections.find(
      (selection) => calculateResult(selection.start_position, lines) === position
    )

    if (!winner) {
      return NextResponse.json({
        success: true,
        winner: null,
        message: '이 자리에 도착한 참가자가 없습니다.',
      })
    }

    // 아직 공개 전이면 결과를 저장한다
    if (!winner.is_revealed) {
      const { error } = await supabaseAdmin
        .from('ladder_selections')
        .update({ result_position: position, is_revealed: true })
        .eq('id', winner.id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      winner: {
        nickname: winner.game_participants?.nickname || '알 수 없음',
        start_position: winner.start_position,
      },
    })
  }

  if (action === 'end') {
    await supabaseAdmin
      .from('game_rooms')
      .update({ status: 'finished', ended_at: new Date().toISOString() })
      .eq('id', room_id)

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: '알 수 없는 action입니다.' }, { status: 400 })
}
