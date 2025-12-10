import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { hashPassword } from '@/lib/auth/admin-utils'
import { createInstructorToken, setInstructorCookie } from '@/lib/auth/instructor-jwt'

export async function POST(request: NextRequest) {
  try {
    const { email, password, name, organization, phone } = await request.json()

    // 유효성 검사
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: '이메일, 비밀번호, 이름은 필수 항목입니다.' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: '비밀번호는 최소 6자 이상이어야 합니다.' },
        { status: 400 }
      )
    }

    const supabase = createClient()

    // 이메일 중복 확인
    const { data: existingUser } = await supabase
      .from('instructor_users')
      .select('id')
      .eq('email', email)
      .single()

    if (existingUser) {
      return NextResponse.json(
        { error: '이미 등록된 이메일입니다.' },
        { status: 400 }
      )
    }

    // 비밀번호 해시
    const passwordHash = await hashPassword(password)

    // 사용자 생성
    const { data: newUser, error } = await supabase
      .from('instructor_users')
      .insert({
        email,
        password_hash: passwordHash,
        name,
        organization: organization || null,
        phone: phone || null,
        approval_status: 'pending',
      })
      .select('id, email, name, approval_status')
      .single()

    if (error) {
      console.error('Register error:', error)
      return NextResponse.json(
        { error: '회원가입 처리 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    // JWT 토큰 생성 및 쿠키 설정
    const token = await createInstructorToken({
      instructorId: newUser.id,
      email: newUser.email,
      name: newUser.name,
      approvalStatus: newUser.approval_status,
    })

    await setInstructorCookie(token)

    return NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        approvalStatus: newUser.approval_status,
      },
      message: '회원가입이 완료되었습니다. 관리자 승인을 기다려주세요.',
    })
  } catch (error) {
    console.error('Register error:', error)
    return NextResponse.json(
      { error: '회원가입 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
