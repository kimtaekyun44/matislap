import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAdminSession } from '@/lib/auth/admin-jwt'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 관리자 인증 확인
    const session = await getAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: '인증되지 않았습니다.' },
        { status: 401 }
      )
    }

    const { id } = await params
    const { status } = await request.json()

    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: '유효하지 않은 상태입니다.' },
        { status: 400 }
      )
    }

    // 강사 프로필 업데이트
    const { error } = await supabaseAdmin
      .from('instructor_profiles')
      .update({
        approval_status: status,
        approved_at: status === 'approved' ? new Date().toISOString() : null,
        approved_by: status === 'approved' ? session.adminId : null,
      })
      .eq('id', id)

    if (error) {
      console.error('Failed to update instructor:', error)
      return NextResponse.json(
        { error: '강사 상태 업데이트에 실패했습니다.' },
        { status: 500 }
      )
    }

    // 시스템 로그 기록
    await supabaseAdmin.from('system_logs').insert({
      action: status === 'approved' ? 'instructor_approved' : 'instructor_rejected',
      actor_type: 'admin',
      actor_id: session.adminId,
      target_type: 'instructor',
      target_id: id,
      details: { status },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Instructor approval error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
