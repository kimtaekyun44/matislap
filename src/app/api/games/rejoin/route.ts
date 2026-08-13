import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// 프록시(nginx 등)를 거치면 실제 클라이언트 IP는 헤더에 담겨 온다
const getClientIp = (request: NextRequest) => {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') || null
}

// POST /api/games/rejoin - 학생이 재진입 승인을 요청
export async function POST(request: NextRequest) {
  try {
    const { roomCode, nickname } = await request.json()

    if (!roomCode || !nickname) {
      return NextResponse.json(
        { error: '방 코드와 닉네임이 필요합니다.' },
        { status: 400 }
      )
    }

    const { data: room } = await supabaseAdmin
      .from('game_rooms')
      .select('id, status')
      .eq('room_code', roomCode.toUpperCase())
      .single()

    if (!room) {
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

    const { data: participant } = await supabaseAdmin
      .from('game_participants')
      .select('id, nickname')
      .eq('room_id', room.id)
      .eq('nickname', nickname)
      .single()

    if (!participant) {
      return NextResponse.json(
        { error: '해당 닉네임의 참가자를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 이미 대기 중인 요청이 있으면 새로 만들지 않는다 (새로고침 연타 대비)
    const { data: pending } = await supabaseAdmin
      .from('rejoin_requests')
      .select('id')
      .eq('participant_id', participant.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (pending) {
      return NextResponse.json({ success: true, request_id: pending.id })
    }

    const { data: created, error } = await supabaseAdmin
      .from('rejoin_requests')
      .insert({
        room_id: room.id,
        participant_id: participant.id,
        nickname: participant.nickname,
        ip_address: getClientIp(request),
        user_agent: request.headers.get('user-agent'),
      })
      .select('id')
      .single()

    if (error) {
      console.error('재진입 요청 생성 오류:', error)
      return NextResponse.json(
        { error: '요청 생성에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, request_id: created.id })
  } catch (error) {
    console.error('재진입 요청 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// GET /api/games/rejoin?request_id=xxx  - 학생이 승인 여부를 확인 (폴링)
// GET /api/games/rejoin?room_id=xxx     - 강사가 대기 중인 요청 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const requestId = searchParams.get('request_id')
    const roomId = searchParams.get('room_id')

    // 학생: 내 요청 상태 확인
    if (requestId) {
      const { data: rejoinRequest } = await supabaseAdmin
        .from('rejoin_requests')
        .select('id, status, participant_id, room_id')
        .eq('id', requestId)
        .single()

      if (!rejoinRequest) {
        return NextResponse.json(
          { error: '요청을 찾을 수 없습니다.' },
          { status: 404 }
        )
      }

      if (rejoinRequest.status !== 'approved') {
        return NextResponse.json({ status: rejoinRequest.status })
      }

      // 승인된 경우에만 참가자 정보를 내려준다
      const [{ data: participant }, { data: room }] = await Promise.all([
        supabaseAdmin
          .from('game_participants')
          .select('id, nickname, score')
          .eq('id', rejoinRequest.participant_id)
          .single(),
        supabaseAdmin
          .from('game_rooms')
          .select('id, room_code, room_name, game_type, status')
          .eq('id', rejoinRequest.room_id)
          .single(),
      ])

      return NextResponse.json({ status: 'approved', participant, room })
    }

    // 강사: 대기 중인 요청 목록
    if (roomId) {
      const session = await getInstructorSession()
      if (!session) {
        return NextResponse.json(
          { error: '로그인이 필요합니다.' },
          { status: 401 }
        )
      }

      const { data: room } = await supabaseAdmin
        .from('game_rooms')
        .select('instructor_id')
        .eq('id', roomId)
        .single()

      if (!room || room.instructor_id !== session.instructorId) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
      }

      const { data: requests } = await supabaseAdmin
        .from('rejoin_requests')
        .select('id, nickname, ip_address, user_agent, created_at')
        .eq('room_id', roomId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      return NextResponse.json({ requests: requests || [] })
    }

    return NextResponse.json(
      { error: 'request_id 또는 room_id가 필요합니다.' },
      { status: 400 }
    )
  } catch (error) {
    console.error('재진입 조회 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// PATCH /api/games/rejoin - 강사가 승인 또는 거부
export async function PATCH(request: NextRequest) {
  try {
    const session = await getInstructorSession()
    if (!session) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const { request_id, action } = await request.json()

    if (!request_id || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'request_id와 action(approve|reject)이 필요합니다.' },
        { status: 400 }
      )
    }

    const { data: rejoinRequest } = await supabaseAdmin
      .from('rejoin_requests')
      .select('id, room_id, status, game_rooms!inner(instructor_id)')
      .eq('id', request_id)
      .single()

    if (!rejoinRequest) {
      return NextResponse.json(
        { error: '요청을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    const roomOwner = (
      rejoinRequest as unknown as { game_rooms: { instructor_id: string } }
    ).game_rooms.instructor_id

    if (roomOwner !== session.instructorId) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }

    if (rejoinRequest.status !== 'pending') {
      return NextResponse.json(
        { error: '이미 처리된 요청입니다.' },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('rejoin_requests')
      .update({
        status: action === 'approve' ? 'approved' : 'rejected',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', request_id)

    if (error) {
      console.error('재진입 처리 오류:', error)
      return NextResponse.json(
        { error: '처리에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('재진입 처리 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
