import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

interface RouteParams {
  params: Promise<{ id: string }>
}

// PATCH /api/games/survey/[id] - 설문 문항 수정 (강사 전용)
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
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
    const { question_text, question_type, options, order_num } = body

    const supabase = await createServerSupabaseClient()

    // 문항 및 방 정보 조회
    const { data: question, error: fetchError } = await supabase
      .from('survey_questions')
      .select('*, game_rooms!inner(instructor_id)')
      .eq('id', id)
      .single()

    if (fetchError || !question) {
      return NextResponse.json(
        { error: '설문 문항을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (question.game_rooms.instructor_id !== session.instructorId) {
      return NextResponse.json(
        { error: '이 설문을 수정할 권한이 없습니다.' },
        { status: 403 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (question_text !== undefined) updateData.question_text = question_text
    if (question_type !== undefined) {
      if (!['short_answer', 'choice_2', 'choice_4'].includes(question_type)) {
        return NextResponse.json(
          { error: '유효하지 않은 문항 유형입니다.' },
          { status: 400 }
        )
      }
      updateData.question_type = question_type
    }
    if (options !== undefined) updateData.options = options
    if (order_num !== undefined) updateData.order_num = order_num

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: '수정할 내용이 없습니다.' },
        { status: 400 }
      )
    }

    const { data: updatedQuestion, error: updateError } = await supabase
      .from('survey_questions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('설문 문항 수정 오류:', updateError)
      return NextResponse.json(
        { error: '설문 문항 수정에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, question: updatedQuestion })
  } catch (error) {
    console.error('설문 수정 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// DELETE /api/games/survey/[id] - 설문 문항 삭제 (강사 전용)
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
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
    const supabase = await createServerSupabaseClient()

    const { data: question, error: fetchError } = await supabase
      .from('survey_questions')
      .select('*, game_rooms!inner(instructor_id)')
      .eq('id', id)
      .single()

    if (fetchError || !question) {
      return NextResponse.json(
        { error: '설문 문항을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (question.game_rooms.instructor_id !== session.instructorId) {
      return NextResponse.json(
        { error: '이 설문을 삭제할 권한이 없습니다.' },
        { status: 403 }
      )
    }

    const { error: deleteError } = await supabase
      .from('survey_questions')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('설문 문항 삭제 오류:', deleteError)
      return NextResponse.json(
        { error: '설문 문항 삭제에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('설문 삭제 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
