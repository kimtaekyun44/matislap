import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET /api/games/drawing/round?room_id=xxx - 현재 라운드 상태 조회
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

    // 방 정보 조회
    const { data: room, error: roomError } = await supabaseAdmin
      .from('game_rooms')
      .select('id, status, current_round_index')
      .eq('id', roomId)
      .single()

    if (roomError || !room) {
      return NextResponse.json(
        { error: '방을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 총 라운드(제시어) 수 조회
    const { count: totalRounds } = await supabaseAdmin
      .from('drawing_words')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId)

    // 현재 라운드 정보 조회
    let currentRound = null
    let currentWord = null
    let drawer = null

    if (room.status === 'in_progress' && room.current_round_index) {
      const { data: round } = await supabaseAdmin
        .from('drawing_rounds')
        .select(`
          *,
          drawing_words (id, word, hint),
          game_participants (id, nickname)
        `)
        .eq('room_id', roomId)
        .eq('round_num', room.current_round_index)
        .single()

      if (round) {
        currentRound = {
          id: round.id,
          round_num: round.round_num,
          status: round.status,
          drawing_data: round.drawing_data,
          time_limit: round.time_limit,
          started_at: round.started_at
        }
        currentWord = round.drawing_words
        drawer = round.game_participants
      }
    }

    return NextResponse.json({
      room: {
        id: room.id,
        status: room.status,
        current_round_index: room.current_round_index
      },
      total_rounds: totalRounds || 0,
      current_round: currentRound,
      current_word: currentWord,
      drawer
    })
  } catch {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// POST /api/games/drawing/round - 게임 시작/다음 라운드 (강사 전용)
export async function POST(request: NextRequest) {
  try {
    const session = await getInstructorSession()
    if (!session) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { room_id, action, drawer_id } = body // action: 'start', 'next', 'end'

    if (!room_id || !action) {
      return NextResponse.json(
        { error: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      )
    }

    // start, next 액션은 drawer_id 필수
    if ((action === 'start' || action === 'next') && !drawer_id) {
      return NextResponse.json(
        { error: '그림 그릴 사람을 선택해주세요.' },
        { status: 400 }
      )
    }

    // 방 소유권 확인
    const { data: room, error: roomError } = await supabaseAdmin
      .from('game_rooms')
      .select('id, instructor_id, status, current_round_index, game_type')
      .eq('id', room_id)
      .single()

    if (roomError || !room) {
      return NextResponse.json(
        { error: '방을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (room.instructor_id !== session.instructorId) {
      return NextResponse.json(
        { error: '이 방을 제어할 권한이 없습니다.' },
        { status: 403 }
      )
    }

    if (room.game_type !== 'drawing') {
      return NextResponse.json(
        { error: '그림 그리기 게임 방이 아닙니다.' },
        { status: 400 }
      )
    }

    // 제시어 목록 조회
    const { data: words, error: wordsError } = await supabaseAdmin
      .from('drawing_words')
      .select('id')
      .eq('room_id', room_id)
      .order('order_num', { ascending: true })

    if (wordsError || !words || words.length === 0) {
      return NextResponse.json(
        { error: '제시어가 없습니다.' },
        { status: 400 }
      )
    }

    // 활성 참가자 목록 조회
    const { data: participants } = await supabaseAdmin
      .from('game_participants')
      .select('id')
      .eq('room_id', room_id)
      .eq('is_active', true)

    if (!participants || participants.length === 0) {
      return NextResponse.json(
        { error: '참가자가 없습니다.' },
        { status: 400 }
      )
    }

    if (action === 'start') {
      if (room.status !== 'waiting') {
        return NextResponse.json(
          { error: '대기 중인 방만 시작할 수 있습니다.' },
          { status: 400 }
        )
      }

      // 기존 라운드 정리 (중복 방지)
      await supabaseAdmin
        .from('drawing_rounds')
        .delete()
        .eq('room_id', room_id)

      // 첫 번째 라운드 생성 - 강사가 선택한 drawer_id 사용
      const { data: newRound, error: roundError } = await supabaseAdmin
        .from('drawing_rounds')
        .insert({
          room_id,
          word_id: words[0].id,
          drawer_id: drawer_id,
          round_num: 1,
          status: 'drawing',
          started_at: new Date().toISOString()
        })
        .select()
        .single()

      if (roundError) {
        console.error('라운드 생성 오류:', roundError)
        return NextResponse.json(
          { error: '라운드 생성에 실패했습니다.' },
          { status: 500 }
        )
      }

      // 방 상태 업데이트
      await supabaseAdmin
        .from('game_rooms')
        .update({
          status: 'in_progress',
          current_round_index: 1,
          started_at: new Date().toISOString()
        })
        .eq('id', room_id)

      return NextResponse.json({
        success: true,
        round: newRound,
        message: '게임이 시작되었습니다!'
      })
    }

    if (action === 'next') {
      if (room.status !== 'in_progress') {
        return NextResponse.json(
          { error: '진행 중인 게임만 다음 라운드로 넘어갈 수 있습니다.' },
          { status: 400 }
        )
      }

      const currentIndex = room.current_round_index || 0
      const nextIndex = currentIndex + 1

      if (nextIndex > words.length) {
        // 모든 라운드 완료 - 게임 종료
        await supabaseAdmin
          .from('game_rooms')
          .update({
            status: 'finished',
            current_round_index: null,
            ended_at: new Date().toISOString()
          })
          .eq('id', room_id)

        return NextResponse.json({
          success: true,
          message: '모든 라운드가 끝났습니다!',
          finished: true
        })
      }

      // 현재 라운드 종료
      await supabaseAdmin
        .from('drawing_rounds')
        .update({
          status: 'finished',
          ended_at: new Date().toISOString()
        })
        .eq('room_id', room_id)
        .eq('round_num', currentIndex)

      // 다음 라운드 생성 - 강사가 선택한 drawer_id 사용
      const { data: newRound, error: roundError } = await supabaseAdmin
        .from('drawing_rounds')
        .insert({
          room_id,
          word_id: words[nextIndex - 1].id,
          drawer_id: drawer_id,
          round_num: nextIndex,
          status: 'drawing',
          started_at: new Date().toISOString()
        })
        .select()
        .single()

      if (roundError) {
        console.error('라운드 생성 오류:', roundError)
        return NextResponse.json(
          { error: '라운드 생성에 실패했습니다.' },
          { status: 500 }
        )
      }

      // 방 상태 업데이트
      await supabaseAdmin
        .from('game_rooms')
        .update({ current_round_index: nextIndex })
        .eq('id', room_id)

      return NextResponse.json({
        success: true,
        round: newRound,
        message: `라운드 ${nextIndex} 시작!`
      })
    }

    if (action === 'end') {
      // 게임 강제 종료
      await supabaseAdmin
        .from('game_rooms')
        .update({
          status: 'finished',
          current_round_index: null,
          ended_at: new Date().toISOString()
        })
        .eq('id', room_id)

      return NextResponse.json({
        success: true,
        message: '게임이 종료되었습니다.'
      })
    }

    return NextResponse.json(
      { error: '유효하지 않은 액션입니다.' },
      { status: 400 }
    )
  } catch (error) {
    console.error('라운드 제어 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
