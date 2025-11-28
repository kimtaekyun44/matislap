'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import toast from 'react-hot-toast'

export default function InstructorLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const supabase = createClient()

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        toast.error(error.message)
        return
      }

      if (data.user) {
        // 강사 프로필 확인
        const { data: profile, error: profileError } = await supabase
          .from('instructor_profiles')
          .select('approval_status')
          .eq('id', data.user.id)
          .single()

        if (profileError || !profile) {
          toast.error('강사 프로필을 찾을 수 없습니다.')
          await supabase.auth.signOut()
          return
        }

        // 승인 상태에 따른 라우팅
        if (profile.approval_status === 'pending') {
          router.push('/pending')
        } else if (profile.approval_status === 'rejected') {
          toast.error('계정이 거부되었습니다. 관리자에게 문의하세요.')
          await supabase.auth.signOut()
        } else if (profile.approval_status === 'approved') {
          toast.success('로그인 성공!')
          router.push('/dashboard')
        }
      }
    } catch (error) {
      toast.error('로그인 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">👨‍🏫 강사 로그인</CardTitle>
          <CardDescription>
            MetisLap 강사 계정으로 로그인하세요
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                이메일
              </label>
              <Input
                id="email"
                type="email"
                placeholder="instructor@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                비밀번호
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '로그인 중...' : '로그인'}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              계정이 없으신가요?{' '}
              <Link href="/register" className="text-primary hover:underline">
                회원가입
              </Link>
            </p>
            <Link href="/" className="text-sm text-center text-muted-foreground hover:underline">
              ← 메인으로 돌아가기
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
