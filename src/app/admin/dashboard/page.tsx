'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import toast from 'react-hot-toast'

interface AdminUser {
  id: string
  email: string
  name: string
  role: string
}

interface InstructorProfile {
  id: string
  email: string
  name: string
  organization: string | null
  phone: string | null
  approval_status: string
  created_at: string
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  const [pendingInstructors, setPendingInstructors] = useState<InstructorProfile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAdminSession()
  }, [])

  const checkAdminSession = async () => {
    try {
      const response = await fetch('/api/admin/auth/me')
      const data = await response.json()

      if (!response.ok) {
        router.push('/admin/login')
        return
      }

      setAdmin(data.admin)
      await fetchPendingInstructors()
    } catch (error) {
      router.push('/admin/login')
    } finally {
      setLoading(false)
    }
  }

  const fetchPendingInstructors = async () => {
    try {
      const response = await fetch('/api/admin/instructors?status=pending')
      const data = await response.json()

      if (response.ok) {
        setPendingInstructors(data.instructors || [])
      }
    } catch (error) {
      console.error('Failed to fetch instructors:', error)
    }
  }

  const handleApproval = async (instructorId: string, status: 'approved' | 'rejected') => {
    try {
      const response = await fetch(`/api/admin/instructors/${instructorId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      })

      if (response.ok) {
        toast.success(status === 'approved' ? '승인되었습니다.' : '거부되었습니다.')
        await fetchPendingInstructors()
      } else {
        toast.error('처리 중 오류가 발생했습니다.')
      }
    } catch (error) {
      toast.error('처리 중 오류가 발생했습니다.')
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' })
      router.push('/admin/login')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-white">로딩 중...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="border-b border-slate-700 bg-slate-800">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">MetisLap Admin</h1>
          <div className="flex items-center gap-4">
            <span className="text-slate-400">
              {admin?.name || admin?.email}
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              로그아웃
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6">
          {/* 통계 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg text-white">승인 대기</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-yellow-500">
                  {pendingInstructors.length}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg text-white">활성 강사</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-500">-</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg text-white">진행중인 게임</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-blue-500">-</p>
              </CardContent>
            </Card>
          </div>

          {/* 승인 대기 목록 */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">강사 승인 대기 목록</CardTitle>
              <CardDescription className="text-slate-400">
                새로 가입한 강사들의 승인 요청입니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingInstructors.length === 0 ? (
                <p className="text-slate-400 text-center py-8">
                  승인 대기 중인 강사가 없습니다.
                </p>
              ) : (
                <div className="space-y-4">
                  {pendingInstructors.map((instructor) => (
                    <div
                      key={instructor.id}
                      className="flex items-center justify-between p-4 bg-slate-700 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-white">{instructor.name}</p>
                        <p className="text-sm text-slate-400">{instructor.email}</p>
                        {instructor.organization && (
                          <p className="text-sm text-slate-500">
                            {instructor.organization}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => handleApproval(instructor.id, 'approved')}
                        >
                          승인
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleApproval(instructor.id, 'rejected')}
                        >
                          거부
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
