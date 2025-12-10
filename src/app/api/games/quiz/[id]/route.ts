import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/games/quiz/[id] - 퀴즈 문제 상세 조회
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()

    const { data: question, error } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !question) {
      return NextResponse.json(
        { error: '퀴즈 문제를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    return NextResponse.json({ question })
  } catch (error) {
    console.error('퀴즈 조회 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// PATCH /api/games/quiz/[id] - 퀴즈 문제 수정 (강사 전용)
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
    const { question_text, question_type, options, correct_answer, time_limit, points, order_num } = body

    const supabase = await createServerSupabaseClient()

    // 문제 및 방 정보 조회
    const { data: question, error: fetchError } = await supabase
      .from('quiz_questions')
      .select('*, game_rooms!inner(instructor_id)')
      .eq('id', id)
      .single()

    if (fetchError || !question) {
      return NextResponse.json(
        { error: '퀴즈 문제를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 방 소유권 확인
    if (question.game_rooms.instructor_id !== session.instructorId) {
      return NextResponse.json(
        { error: '이 퀴즈를 수정할 권한이 없습니다.' },
        { status: 403 }
      )
    }

    // 업데이트할 필드 구성
    const updateData: Record<string, unknown> = {}
    if (question_text !== undefined) updateData.question_text = question_text
    if (question_type !== undefined) {
      if (!['multiple_choice', 'ox'].includes(question_type)) {
        return NextResponse.json(
          { error: '유효하지 않은 문제 유형입니다.' },
          { status: 400 }
        )
      }
      updateData.question_type = question_type
    }
    if (options !== undefined) updateData.options = options
    if (correct_answer !== undefined) updateData.correct_answer = correct_answer
    if (time_limit !== undefined) updateData.time_limit = time_limit
    if (points !== undefined) updateData.points = points
    if (order_num !== undefined) updateData.order_num = order_num

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: '수정할 내용이 없습니다.' },
        { status: 400 }
      )
    }

    // 퀴즈 문제 수정
    const { data: updatedQuestion, error: updateError } = await supabase
      .from('quiz_questions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('퀴즈 문제 수정 오류:', updateError)
      return NextResponse.json(
        { error: '퀴즈 문제 수정에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, question: updatedQuestion })
  } catch (error) {
    console.error('퀴즈 수정 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// DELETE /api/games/quiz/[id] - 퀴즈 문제 삭제 (강사 전용)
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

    // 문제 및 방 정보 조회
    const { data: question, error: fetchError } = await supabase
      .from('quiz_questions')
      .select('*, game_rooms!inner(instructor_id)')
      .eq('id', id)
      .single()

    if (fetchError || !question) {
      return NextResponse.json(
        { error: '퀴즈 문제를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 방 소유권 확인
    if (question.game_rooms.instructor_id !== session.instructorId) {
      return NextResponse.json(
        { error: '이 퀴즈를 삭제할 권한이 없습니다.' },
        { status: 403 }
      )
    }

    // 퀴즈 문제 삭제
    const { error: deleteError } = await supabase
      .from('quiz_questions')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('퀴즈 문제 삭제 오류:', deleteError)
      return NextResponse.json(
        { error: '퀴즈 문제 삭제에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('퀴즈 삭제 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
