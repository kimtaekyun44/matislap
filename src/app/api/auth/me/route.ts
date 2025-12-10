import { NextResponse } from 'next/server'
import { getInstructorSession } from '@/lib/auth/instructor-jwt'

export async function GET() {
  try {
    const session = await getInstructorSession()

    if (!session) {
      return NextResponse.json(
        { error: '인증되지 않은 사용자입니다.' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      user: {
        id: session.instructorId,
        email: session.email,
        name: session.name,
        approvalStatus: session.approvalStatus,
      },
    })
  } catch (error) {
    console.error('Get session error:', error)
    return NextResponse.json(
      { error: '세션 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
