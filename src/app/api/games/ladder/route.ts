import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET: 결과 항목 목록 조회
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const roomId = searchParams.get('room_id')

  if (!roomId) {
    return NextResponse.json({ error: 'room_id가 필요합니다.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('ladder_items')
    .select('*')
    .eq('room_id', roomId)
    .order('position', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data })
}

// POST: 결과 항목 추가
export async function POST(request: NextRequest) {
  const session = await getInstructorSession()
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const body = await request.json()
  const { room_id, item_text } = body

  if (!room_id || !item_text) {
    return NextResponse.json({ error: 'room_id와 item_text가 필요합니다.' }, { status: 400 })
  }

  // 방 소유권 확인
  const { data: room } = await supabaseAdmin
    .from('game_rooms')
    .select('instructor_id')
    .eq('id', room_id)
    .single()

  if (!room || room.instructor_id !== session.instructorId) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  // 현재 최대 position 조회
  const { data: maxItem } = await supabaseAdmin
    .from('ladder_items')
    .select('position')
    .eq('room_id', room_id)
    .order('position', { ascending: false })
    .limit(1)
    .single()

  const nextPosition = maxItem ? maxItem.position + 1 : 0

  const { data, error } = await supabaseAdmin
    .from('ladder_items')
    .insert({
      room_id,
      item_text,
      position: nextPosition,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data })
}
