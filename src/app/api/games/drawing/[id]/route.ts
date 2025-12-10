import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET /api/games/drawing/[id] - 제시어 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: word, error } = await supabaseAdmin
      .from('drawing_words')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !word) {
      return NextResponse.json(
        { error: '제시어를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    return NextResponse.json({ word })
  } catch (error) {
    console.error('제시어 조회 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// PATCH /api/games/drawing/[id] - 제시어 수정 (강사 전용)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getInstructorSession()
    if (!session) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const { word, hint } = body

    // 제시어 조회 및 방 소유권 확인
    const { data: existingWord, error: wordError } = await supabaseAdmin
      .from('drawing_words')
      .select('*, game_rooms!inner(instructor_id)')
      .eq('id', id)
      .single()

    if (wordError || !existingWord) {
      return NextResponse.json(
        { error: '제시어를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (existingWord.game_rooms.instructor_id !== session.instructorId) {
      return NextResponse.json(
        { error: '이 제시어를 수정할 권한이 없습니다.' },
        { status: 403 }
      )
    }

    // 업데이트할 데이터 준비
    const updateData: Record<string, unknown> = {}
    if (word !== undefined) updateData.word = word.trim()
    if (hint !== undefined) updateData.hint = hint?.trim() || null

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: '수정할 내용이 없습니다.' },
        { status: 400 }
      )
    }

    const { data: updatedWord, error: updateError } = await supabaseAdmin
      .from('drawing_words')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('제시어 수정 오류:', updateError)
      return NextResponse.json(
        { error: '제시어 수정에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      word: updatedWord
    })
  } catch (error) {
    console.error('제시어 수정 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// DELETE /api/games/drawing/[id] - 제시어 삭제 (강사 전용)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getInstructorSession()
    if (!session) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const { id } = await params

    // 제시어 조회 및 방 소유권 확인
    const { data: existingWord, error: wordError } = await supabaseAdmin
      .from('drawing_words')
      .select('*, game_rooms!inner(instructor_id)')
      .eq('id', id)
      .single()

    if (wordError || !existingWord) {
      return NextResponse.json(
        { error: '제시어를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (existingWord.game_rooms.instructor_id !== session.instructorId) {
      return NextResponse.json(
        { error: '이 제시어를 삭제할 권한이 없습니다.' },
        { status: 403 }
      )
    }

    const { error: deleteError } = await supabaseAdmin
      .from('drawing_words')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('제시어 삭제 오류:', deleteError)
      return NextResponse.json(
        { error: '제시어 삭제에 실패했습니다.' },
        { status: 500 }
      )
    }

    // 순서 재정렬
    const { data: remainingWords } = await supabaseAdmin
      .from('drawing_words')
      .select('id')
      .eq('room_id', existingWord.room_id)
      .order('order_num', { ascending: true })

    if (remainingWords) {
      for (let i = 0; i < remainingWords.length; i++) {
        await supabaseAdmin
          .from('drawing_words')
          .update({ order_num: i + 1 })
          .eq('id', remainingWords[i].id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('제시어 삭제 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
