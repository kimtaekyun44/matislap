import { NextResponse } from 'next/server'
import { clearAdminCookie } from '@/lib/auth/admin-jwt'

export async function POST() {
  try {
    await clearAdminCookie()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin logout error:', error)
    return NextResponse.json(
      { error: '로그아웃 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
