import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 관리자 페이지는 Supabase Auth 세션 업데이트 제외
  // 관리자는 별도의 JWT 인증 사용
  if (pathname.startsWith('/admin')) {
    // /admin/login은 인증 없이 접근 허용
    if (pathname === '/admin/login') {
      return NextResponse.next()
    }

    // 관리자 API는 자체 인증 처리
    if (pathname.startsWith('/api/admin')) {
      return NextResponse.next()
    }

    // 관리자 페이지는 클라이언트에서 인증 확인
    return NextResponse.next()
  }

  // 강사 관련 페이지는 Supabase Auth 세션 업데이트
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
