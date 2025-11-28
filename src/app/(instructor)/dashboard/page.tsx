'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import toast from 'react-hot-toast'

interface InstructorProfile {
  id: string
  email: string
  name: string
  organization: string | null
}

interface GameRoom {
  id: string
  room_code: string
  name: string
  status: string
  created_at: string
}

export default function InstructorDashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<InstructorProfile | null>(null)
  const [rooms, setRooms] = useState<GameRoom[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkSession()
  }, [])

  const checkSession = async () => {
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    // 프로필 및 승인 상태 확인
    const { data: profileData, error: profileError } = await supabase
      .from('instructor_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profileData) {
      toast.error('프로필을 찾을 수 없습니다.')
      await supabase.auth.signOut()
      router.push('/login')
      return
    }

    if (profileData.approval_status !== 'approved') {
      router.push('/pending')
      return
    }

    setProfile(profileData)

    // 게임 방 목록 가져오기
    const { data: roomsData } = await supabase
      .from('game_rooms')
      .select('*')
      .eq('instructor_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (roomsData) {
      setRooms(roomsData)
    }

    setLoading(false)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleCreateRoom = async () => {
    // TODO: 방 생성 로직 구현
    toast.success('방 생성 기능은 곧 추가됩니다!')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-lg">로딩 중...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <header className="border-b bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="text-xl font-bold text-primary">
            MetisLap
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {profile?.name}님
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              로그아웃
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">강사 대시보드</h1>
          <p className="text-muted-foreground">
            게임 방을 생성하고 관리하세요
          </p>
        </div>

        <div className="grid gap-6">
          {/* 빠른 액션 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={handleCreateRoom}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  + 새 게임 방 만들기
                </CardTitle>
                <CardDescription>
                  학생들이 참여할 수 있는 게임 방을 생성합니다
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">내 게임 방</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-primary">{rooms.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">총 참가자</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-600">-</p>
              </CardContent>
            </Card>
          </div>

          {/* 최근 게임 방 */}
          <Card>
            <CardHeader>
              <CardTitle>최근 게임 방</CardTitle>
              <CardDescription>
                최근에 생성한 게임 방 목록입니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rooms.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">
                    아직 생성한 게임 방이 없습니다.
                  </p>
                  <Button onClick={handleCreateRoom}>
                    첫 번째 게임 방 만들기
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {rooms.map((room) => (
                    <div
                      key={room.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div>
                        <p className="font-medium">{room.name}</p>
                        <p className="text-sm text-muted-foreground">
                          방 코드: {room.room_code}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            room.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : room.status === 'waiting'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {room.status === 'active' ? '진행중' : room.status === 'waiting' ? '대기중' : '종료'}
                        </span>
                        <Button variant="outline" size="sm">
                          관리
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
