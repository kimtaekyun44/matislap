import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// 게임 방 목록 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getInstructorSession()

    if (!session) {
      return NextResponse.json(
        { error: '인증되지 않은 사용자입니다.' },
        { status: 401 }
      )
    }

    if (session.approvalStatus !== 'approved') {
      return NextResponse.json(
        { error: '승인된 강사만 이용 가능합니다.' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    let query = supabaseAdmin
      .from('game_rooms')
      .select('*')
      .eq('instructor_id', session.instructorId)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data: rooms, error } = await query

    if (error) {
      console.error('Failed to fetch rooms:', error)
      return NextResponse.json(
        { error: '게임 방 목록을 불러오는데 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ rooms })
  } catch (error) {
    console.error('Rooms API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// 게임 방 생성
export async function POST(request: NextRequest) {
  try {
    const session = await getInstructorSession()

    if (!session) {
      return NextResponse.json(
        { error: '인증되지 않은 사용자입니다.' },
        { status: 401 }
      )
    }

    if (session.approvalStatus !== 'approved') {
      return NextResponse.json(
        { error: '승인된 강사만 이용 가능합니다.' },
        { status: 403 }
      )
    }

    const { roomName, gameType, maxParticipants, gameConfig } = await request.json()

    if (!roomName || !gameType) {
      return NextResponse.json(
        { error: '방 이름과 게임 타입은 필수입니다.' },
        { status: 400 }
      )
    }

    const validGameTypes = ['quiz', 'drawing', 'word_chain', 'speed_quiz', 'voting']
    if (!validGameTypes.includes(gameType)) {
      return NextResponse.json(
        { error: '유효하지 않은 게임 타입입니다.' },
        { status: 400 }
      )
    }

    // 방 생성 (room_code는 DB 트리거에서 자동 생성)
    const { data: room, error } = await supabaseAdmin
      .from('game_rooms')
      .insert({
        instructor_id: session.instructorId,
        room_name: roomName,
        game_type: gameType,
        max_participants: maxParticipants || 30,
        game_config: gameConfig || {},
        status: 'waiting',
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create room:', error)
      return NextResponse.json(
        { error: '게임 방 생성에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      room,
      message: '게임 방이 생성되었습니다.',
    })
  } catch (error) {
    console.error('Create room error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
