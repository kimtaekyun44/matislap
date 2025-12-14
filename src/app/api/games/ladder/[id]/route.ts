import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// PATCH: 결과 항목 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getInstructorSession()
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { item_text } = body

  if (!item_text) {
    return NextResponse.json({ error: 'item_text가 필요합니다.' }, { status: 400 })
  }

  // 항목 조회 및 권한 확인
  const { data: item } = await supabaseAdmin
    .from('ladder_items')
    .select('room_id')
    .eq('id', id)
    .single()

  if (!item) {
    return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 })
  }

  const { data: room } = await supabaseAdmin
    .from('game_rooms')
    .select('instructor_id')
    .eq('id', item.room_id)
    .single()

  if (!room || room.instructor_id !== session.instructorId) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('ladder_items')
    .update({ item_text })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data })
}

// DELETE: 결과 항목 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getInstructorSession()
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params

  // 항목 조회 및 권한 확인
  const { data: item } = await supabaseAdmin
    .from('ladder_items')
    .select('room_id, position')
    .eq('id', id)
    .single()

  if (!item) {
    return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 })
  }

  const { data: room } = await supabaseAdmin
    .from('game_rooms')
    .select('instructor_id')
    .eq('id', item.room_id)
    .single()

  if (!room || room.instructor_id !== session.instructorId) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  // 삭제
  const { error } = await supabaseAdmin
    .from('ladder_items')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 뒤에 있는 항목들의 position 재정렬 (rpc 없으면 무시)
  try {
    await supabaseAdmin.rpc('reorder_ladder_items', {
      p_room_id: item.room_id,
      p_deleted_position: item.position,
    })
  } catch {
    // rpc 없으면 무시
  }

  return NextResponse.json({ success: true })
}
