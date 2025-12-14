'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { apiFetch } from '@/lib/utils/api'

interface UserSession {
  id: string
  email: string
  name: string
  approvalStatus: 'pending' | 'approved' | 'rejected'
}

export default function PendingApprovalPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkStatus()
  }, [])

  const checkStatus = async () => {
    try {
      const response = await apiFetch('/api/auth/me')

      if (!response.ok) {
        router.push('/login')
        return
      }

      const data = await response.json()
      setUser(data.user)

      if (data.user.approvalStatus === 'approved') {
        router.push('/dashboard')
      }
    } catch {
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
      router.push('/')
    } catch {
      router.push('/')
    }
  }

  const handleRefresh = () => {
    setLoading(true)
    checkStatus()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-lg">로딩 중...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          {user?.approvalStatus === 'pending' && (
            <>
              <div className="text-6xl mb-4">⏳</div>
              <CardTitle className="text-2xl">승인 대기 중</CardTitle>
              <CardDescription>
                관리자의 승인을 기다리고 있습니다
              </CardDescription>
            </>
          )}
          {user?.approvalStatus === 'rejected' && (
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
          {user?.approvalStatus === 'pending' && (
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
          {user?.approvalStatus === 'rejected' && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-800 dark:text-red-200">
                계정 승인이 거부되었습니다.
                <br />
                자세한 내용은 관리자에게 문의해주세요.
              </p>
            </div>
          )}
          {user && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                로그인 계정: {user.email}
              </p>
              <p className="text-sm text-muted-foreground">
                이름: {user.name}
              </p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button onClick={handleRefresh} variant="outline" className="w-full">
            상태 새로고침
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
