import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// 게임 방 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getInstructorSession()

    if (!session) {
      return NextResponse.json(
        { error: '인증되지 않은 사용자입니다.' },
        { status: 401 }
      )
    }

    const { id } = await params

    const { data: room, error } = await supabaseAdmin
      .from('game_rooms')
      .select('*')
      .eq('id', id)
      .eq('instructor_id', session.instructorId)
      .single()

    if (error || !room) {
      return NextResponse.json(
        { error: '게임 방을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 참가자 수 조회
    const { count: participantCount } = await supabaseAdmin
      .from('game_participants')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', id)
      .eq('is_active', true)

    return NextResponse.json({
      room: {
        ...room,
        participant_count: participantCount || 0,
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

// 게임 방 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getInstructorSession()

    if (!session) {
      return NextResponse.json(
        { error: '인증되지 않은 사용자입니다.' },
        { status: 401 }
      )
    }

    const { id } = await params
    const updates = await request.json()

    // 업데이트 가능한 필드만 허용
    const allowedFields = ['room_name', 'max_participants', 'game_config', 'status']
    const filteredUpdates: Record<string, unknown> = {}

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field]
      }
    }

    // 상태 변경 시 추가 처리
    if (filteredUpdates.status === 'in_progress') {
      filteredUpdates.started_at = new Date().toISOString()
    } else if (filteredUpdates.status === 'finished') {
      filteredUpdates.ended_at = new Date().toISOString()
    } else if (filteredUpdates.status === 'waiting') {
      // 대기 상태로 되돌릴 때 게임 관련 데이터 초기화
      filteredUpdates.current_question_index = null
      filteredUpdates.started_at = null
      filteredUpdates.ended_at = null
    }

    const { data: room, error } = await supabaseAdmin
      .from('game_rooms')
      .update(filteredUpdates)
      .eq('id', id)
      .eq('instructor_id', session.instructorId)
      .select()
      .single()

    if (error) {
      console.error('Update room error:', error)
      return NextResponse.json(
        { error: '게임 방 수정에 실패했습니다.' },
        { status: 500 }
      )
    }

    if (!room) {
      return NextResponse.json(
        { error: '게임 방을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      room,
    })
  } catch (error) {
    console.error('Update room error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// 게임 방 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getInstructorSession()

    if (!session) {
      return NextResponse.json(
        { error: '인증되지 않은 사용자입니다.' },
        { status: 401 }
      )
    }

    const { id } = await params

    // 진행 중인 방은 삭제 불가
    const { data: existingRoom } = await supabaseAdmin
      .from('game_rooms')
      .select('status')
      .eq('id', id)
      .eq('instructor_id', session.instructorId)
      .single()

    if (!existingRoom) {
      return NextResponse.json(
        { error: '게임 방을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (existingRoom.status === 'in_progress') {
      return NextResponse.json(
        { error: '진행 중인 게임 방은 삭제할 수 없습니다.' },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('game_rooms')
      .delete()
      .eq('id', id)
      .eq('instructor_id', session.instructorId)

    if (error) {
      console.error('Delete room error:', error)
      return NextResponse.json(
        { error: '게임 방 삭제에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '게임 방이 삭제되었습니다.',
    })
  } catch (error) {
    console.error('Delete room error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
