import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// 방 코드로 방 정보 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const includeFinished = searchParams.get('include_finished') === 'true'

    if (!code) {
      return NextResponse.json(
        { error: '방 코드를 입력해주세요.' },
        { status: 400 }
      )
    }

    const { data: room, error } = await supabaseAdmin
      .from('game_rooms')
      .select('id, room_code, room_name, game_type, status, max_participants, current_question_index')
      .eq('room_code', code.toUpperCase())
      .single()

    if (error || !room) {
      return NextResponse.json(
        { error: '존재하지 않는 방 코드입니다.' },
        { status: 404 }
      )
    }

    // include_finished가 true가 아니면 종료된 게임 접근 불가
    if (room.status === 'finished' && !includeFinished) {
      return NextResponse.json(
        { error: '이미 종료된 게임입니다.' },
        { status: 400 }
      )
    }

    // 현재 참가자 수 조회
    const { count } = await supabaseAdmin
      .from('game_participants')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room.id)
      .eq('is_active', true)

    return NextResponse.json({
      room: {
        ...room,
        participant_count: count || 0,
      },
    })
  } catch (error) {
    console.error('Get room error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// 방 참여 (참가자 등록)
export async function POST(request: NextRequest) {
  try {
    const { roomCode, nickname, forceRejoin, participantId } = await request.json()

    // forceRejoin: 활동 이력 없는 중복 참가자 재진입
    if (forceRejoin && participantId) {
      const { data: existingRoom } = await supabaseAdmin
        .from('game_rooms')
        .select('id, room_code, room_name, game_type, status')
        .eq('room_code', roomCode.toUpperCase())
        .single()

      if (!existingRoom) {
        return NextResponse.json({ error: '존재하지 않는 방 코드입니다.' }, { status: 404 })
      }

      const { data: rejoined } = await supabaseAdmin
        .from('game_participants')
        .select('id, nickname, score')
        .eq('id', participantId)
        .eq('room_id', existingRoom.id)
        .single()

      if (!rejoined) {
        return NextResponse.json({ error: '참가자 정보를 찾을 수 없습니다.' }, { status: 404 })
      }

      return NextResponse.json({
        success: true,
        participant: { id: rejoined.id, nickname: rejoined.nickname, score: rejoined.score },
        room: { id: existingRoom.id, room_code: existingRoom.room_code, room_name: existingRoom.room_name, game_type: existingRoom.game_type, status: existingRoom.status },
      })
    }

    if (!roomCode || !nickname) {
      return NextResponse.json(
        { error: '방 코드와 닉네임을 입력해주세요.' },
        { status: 400 }
      )
    }

    if (nickname.length < 2 || nickname.length > 20) {
      return NextResponse.json(
        { error: '닉네임은 2~20자 사이로 입력해주세요.' },
        { status: 400 }
      )
    }

    // 방 조회
    const { data: room, error: roomError } = await supabaseAdmin
      .from('game_rooms')
      .select('id, room_code, room_name, game_type, status, max_participants')
      .eq('room_code', roomCode.toUpperCase())
      .single()

    if (roomError || !room) {
      return NextResponse.json(
        { error: '존재하지 않는 방 코드입니다.' },
        { status: 404 }
      )
    }

    if (room.status === 'finished') {
      return NextResponse.json(
        { error: '이미 종료된 게임입니다.' },
        { status: 400 }
      )
    }

    // 현재 참가자 수 확인
    const { count } = await supabaseAdmin
      .from('game_participants')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room.id)
      .eq('is_active', true)

    if (count && count >= room.max_participants) {
      return NextResponse.json(
        { error: '참가자 수가 가득 찼습니다.' },
        { status: 400 }
      )
    }

    // 닉네임 중복 확인
    const { data: existingParticipant } = await supabaseAdmin
      .from('game_participants')
      .select('id, is_active')
      .eq('room_id', room.id)
      .eq('nickname', nickname)
      .single()

    let participant

    if (existingParticipant) {
      if (existingParticipant.is_active) {
        // 활동 이력 확인 (퀴즈, 설문, 그림, 사다리)
        const [quizCount, surveyCount, drawingCount, ladderCount] = await Promise.all([
          supabaseAdmin.from('quiz_answers').select('*', { count: 'exact', head: true }).eq('participant_id', existingParticipant.id),
          supabaseAdmin.from('survey_answers').select('*', { count: 'exact', head: true }).eq('participant_id', existingParticipant.id),
          supabaseAdmin.from('drawing_guesses').select('*', { count: 'exact', head: true }).eq('participant_id', existingParticipant.id),
          supabaseAdmin.from('ladder_selections').select('*', { count: 'exact', head: true }).eq('participant_id', existingParticipant.id),
        ])

        const hasActivity =
          (quizCount.count ?? 0) > 0 ||
          (surveyCount.count ?? 0) > 0 ||
          (drawingCount.count ?? 0) > 0 ||
          (ladderCount.count ?? 0) > 0

        if (hasActivity) {
          return NextResponse.json(
            { error: '이미 사용 중인 닉네임입니다.' },
            { status: 400 }
          )
        }

        // 활동 이력 없음 → 재진입 가능 안내
        return NextResponse.json(
          { error: '이미 입장한 닉네임입니다.', canRejoin: true, participantId: existingParticipant.id },
          { status: 409 }
        )
      }

      // 비활성 참가자 재활성화
      const { data, error } = await supabaseAdmin
        .from('game_participants')
        .update({
          is_active: true,
          left_at: null,
          joined_at: new Date().toISOString(),
        })
        .eq('id', existingParticipant.id)
        .select()
        .single()

      if (error) {
        console.error('Rejoin error:', error)
        return NextResponse.json(
          { error: '참여 처리 중 오류가 발생했습니다.' },
          { status: 500 }
        )
      }

      participant = data
    } else {
      // 새 참가자 등록
      const { data, error } = await supabaseAdmin
        .from('game_participants')
        .insert({
          room_id: room.id,
          nickname,
          is_active: true,
          score: 0,
        })
        .select()
        .single()

      if (error) {
        console.error('Join error:', error)
        return NextResponse.json(
          { error: '참여 처리 중 오류가 발생했습니다.' },
          { status: 500 }
        )
      }

      participant = data
    }

    return NextResponse.json({
      success: true,
      participant: {
        id: participant.id,
        nickname: participant.nickname,
        score: participant.score,
      },
      room: {
        id: room.id,
        room_code: room.room_code,
        room_name: room.room_name,
        game_type: room.game_type,
        status: room.status,
      },
    })
  } catch (error) {
    console.error('Join error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
