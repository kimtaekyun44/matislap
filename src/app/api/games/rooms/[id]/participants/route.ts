import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// 참가자 목록 조회
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

    // 방 소유자 확인
    const { data: room } = await supabaseAdmin
      .from('game_rooms')
      .select('id')
      .eq('id', id)
      .eq('instructor_id', session.instructorId)
      .single()

    if (!room) {
      return NextResponse.json(
        { error: '게임 방을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 참가자 목록 조회
    const { data: participants, error } = await supabaseAdmin
      .from('game_participants')
      .select('id, nickname, score, is_active, joined_at')
      .eq('room_id', id)
      .order('joined_at', { ascending: true })

    if (error) {
      console.error('Failed to fetch participants:', error)
      return NextResponse.json(
        { error: '참가자 목록을 불러오는데 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ participants })
  } catch (error) {
    console.error('Participants API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
