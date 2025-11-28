'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'

export default function PendingApprovalPage() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('pending')

  useEffect(() => {
    checkStatus()
  }, [])

  const checkStatus = async () => {
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    setUserEmail(user.email || null)

    const { data: profile } = await supabase
      .from('instructor_profiles')
      .select('approval_status')
      .eq('id', user.id)
      .single()

    if (profile) {
      setStatus(profile.approval_status)

      if (profile.approval_status === 'approved') {
        router.push('/dashboard')
      } else if (profile.approval_status === 'rejected') {
        // 거부된 경우 표시
      }
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleRefresh = () => {
    checkStatus()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          {status === 'pending' && (
            <>
              <div className="text-6xl mb-4">⏳</div>
              <CardTitle className="text-2xl">승인 대기 중</CardTitle>
              <CardDescription>
                관리자의 승인을 기다리고 있습니다
              </CardDescription>
            </>
          )}
          {status === 'rejected' && (
            <>
              <div className="text-6xl mb-4">❌</div>
              <CardTitle className="text-2xl text-red-600">승인 거부됨</CardTitle>
              <CardDescription>
                계정 승인이 거부되었습니다
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'pending' && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                회원가입이 완료되었습니다!
                <br />
                관리자가 계정을 검토 중입니다.
                <br />
                승인되면 서비스를 이용하실 수 있습니다.
              </p>
            </div>
          )}
          {status === 'rejected' && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-800 dark:text-red-200">
                계정 승인이 거부되었습니다.
                <br />
                자세한 내용은 관리자에게 문의해주세요.
              </p>
            </div>
          )}
          {userEmail && (
            <p className="text-sm text-muted-foreground">
              로그인 계정: {userEmail}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button onClick={handleRefresh} variant="outline" className="w-full">
            🔄 상태 새로고침
          </Button>
          <Button onClick={handleLogout} variant="ghost" className="w-full">
            로그아웃
          </Button>
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            ← 메인으로 돌아가기
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
