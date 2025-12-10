import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { hashPassword } from '@/lib/auth/admin-utils'

/**
 * 초기 관리자 계정 설정 API
 * 주의: 관리자가 없을 때만 작동합니다
 */
export async function POST(request: NextRequest) {
  try {
    const { email, name, password, setupKey } = await request.json()

    // 환경변수의 setup key 확인 (보안)
    const validSetupKey = process.env.ADMIN_SETUP_KEY || 'metislap-setup-2024'
    if (setupKey !== validSetupKey) {
      return NextResponse.json(
        { error: '유효하지 않은 설정 키입니다.' },
        { status: 403 }
      )
    }

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: '이메일, 이름, 비밀번호를 입력해주세요.' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: '비밀번호는 최소 8자 이상이어야 합니다.' },
        { status: 400 }
      )
    }

    const supabase = createClient()

    // 이미 관리자가 있는지 확인
    const { data: existingAdmin } = await supabase
      .from('admin_users')
      .select('id')
      .limit(1)
      .single()

    if (existingAdmin) {
      return NextResponse.json(
        { error: '이미 관리자 계정이 존재합니다.' },
        { status: 400 }
      )
    }

    // 비밀번호 해시
    const passwordHash = await hashPassword(password)

    // 관리자 계정 생성
    const { data, error } = await supabase
      .from('admin_users')
      .insert({
        email,
        name,
        password_hash: passwordHash,
        must_change_password: false,
      })
      .select('id, email, name')
      .single()

    if (error) {
      console.error('Admin setup error:', error)
      return NextResponse.json(
        { error: '관리자 계정 생성에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      admin: data,
      message: '관리자 계정이 생성되었습니다.',
    })
  } catch (error) {
    console.error('Admin setup error:', error)
    return NextResponse.json(
      { error: '설정 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
