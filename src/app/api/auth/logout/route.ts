import { NextResponse } from 'next/server'
import { clearInstructorCookie } from '@/lib/auth/instructor-jwt'

export async function POST() {
  try {
    await clearInstructorCookie()

    return NextResponse.json({
      success: true,
      message: '로그아웃되었습니다.',
    })
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: '로그아웃 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
