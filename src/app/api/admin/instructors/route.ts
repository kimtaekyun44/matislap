import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAdminSession } from '@/lib/auth/admin-jwt'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    // 관리자 인증 확인
    const session = await getAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: '인증되지 않았습니다.' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    let query = supabaseAdmin
      .from('instructor_profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('approval_status', status)
    }

    const { data: instructors, error } = await query

    if (error) {
      console.error('Failed to fetch instructors:', error)
      return NextResponse.json(
        { error: '강사 목록을 불러오는데 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ instructors })
  } catch (error) {
    console.error('Instructors API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
