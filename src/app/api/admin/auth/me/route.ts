import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth/admin-jwt'

export async function GET() {
  try {
    const session = await getAdminSession()

    if (!session) {
      return NextResponse.json(
        { error: '인증되지 않았습니다.' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      admin: {
        id: session.adminId,
        username: session.username,
        role: session.role,
      },
    })
  } catch (error) {
    console.error('Admin session error:', error)
    return NextResponse.json(
      { error: '세션 확인 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
