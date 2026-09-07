import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/**
 * 게임 종류별로 복사할 문항 테이블과 컬럼.
 * id / room_id / created_at 은 새로 만들어지므로 제외한다.
 */
const CONTENT_TABLES: Record<
  string,
  { table: string; columns: string[]; orderField: string; orderBase: number }
> = {
  quiz: {
    table: 'quiz_questions',
    columns: [
      'question_text',
      'question_type',
      'options',
      'correct_answer',
      'time_limit',
      'points',
      'order_num',
      'image_url',
    ],
    orderField: 'order_num',
    orderBase: 1,
  },
  drawing: {
    table: 'drawing_words',
    columns: ['word', 'hint', 'order_num'],
    orderField: 'order_num',
    orderBase: 1,
  },
  ladder: {
    // is_auto 항목("다음 기회에")은 시작할 때 다시 만들어지므로 복사하지 않는다
    table: 'ladder_items',
    columns: ['item_text', 'position'],
    orderField: 'position',
    orderBase: 0,
  },
  survey: {
    table: 'survey_questions',
    columns: ['question_text', 'question_type', 'options', 'order_num'],
    orderField: 'order_num',
    orderBase: 1,
  },
  jeopardy: {
    table: 'jeopardy_questions',
    columns: ['category', 'points', 'content', 'answer', 'order_num', 'question_type', 'options'],
    orderField: 'order_num',
    orderBase: 1,
  },
}

// POST /api/games/rooms/[id]/duplicate - 방 복사 (문항만, 참가자/기록은 제외)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getInstructorSession()
    if (!session) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const { data: source } = await supabaseAdmin
      .from('game_rooms')
      .select('id, instructor_id, game_type, room_name, max_participants, game_config')
      .eq('id', id)
      .single()

    if (!source) {
      return NextResponse.json({ error: '방을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (source.instructor_id !== session.instructorId) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }

    const roomName =
      typeof body.room_name === 'string' && body.room_name.trim()
        ? body.room_name.trim()
        : `${source.room_name} (복사)`

    // 새 방은 항상 대기 상태로 시작한다. room_code 는 트리거가 새로 만든다.
    const { data: newRoom, error: roomError } = await supabaseAdmin
      .from('game_rooms')
      .insert({
        instructor_id: session.instructorId,
        game_type: source.game_type,
        room_name: roomName,
        max_participants: source.max_participants,
        game_config: source.game_config,
        status: 'waiting',
      })
      .select()
      .single()

    if (roomError || !newRoom) {
      console.error('방 복사 오류:', roomError)
      return NextResponse.json({ error: '방 복사에 실패했습니다.' }, { status: 500 })
    }

    // 문항 복사
    const spec = CONTENT_TABLES[source.game_type]
    let copiedCount = 0

    if (spec) {
      // 컬럼을 문자열로 지정하면 타입 추론이 안 되므로 unknown 을 거쳐 다룬다
      const { data } = await supabaseAdmin
        .from(spec.table)
        .select(spec.columns.join(', '))
        .eq('room_id', id)
        .order(spec.orderField, { ascending: true })

      const rows = (data || []) as unknown as Record<string, unknown>[]

      if (rows.length > 0) {
        // 복사본은 새로 시작하는 방이므로 순서 번호를 빈틈없이 다시 매긴다
        // (원본에서 중간 문항을 지웠다면 1,3,4 같은 구멍이 그대로 넘어온다)
        const cloned = rows.map((row, index) => ({
          ...row,
          room_id: newRoom.id,
          [spec.orderField]: spec.orderBase + index,
        }))

        const { error: contentError } = await supabaseAdmin
          .from(spec.table)
          .insert(cloned)

        if (contentError) {
          // 문항 복사에 실패하면 빈 방만 남으므로 되돌린다
          console.error('문항 복사 오류:', contentError)
          await supabaseAdmin.from('game_rooms').delete().eq('id', newRoom.id)
          return NextResponse.json(
            { error: '문항 복사에 실패했습니다.' },
            { status: 500 }
          )
        }

        copiedCount = cloned.length
      }
    }

    return NextResponse.json({
      success: true,
      room: newRoom,
      copied_count: copiedCount,
    })
  } catch (error) {
    console.error('방 복사 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
