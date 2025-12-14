'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'

interface UserSession {
  id: string
  email: string
  name: string
  approvalStatus: 'pending' | 'approved' | 'rejected'
}

interface GameRoom {
  id: string
  room_code: string
  room_name: string
  game_type: string
  status: string
  created_at: string
}

const GAME_TYPES = [
  { value: 'quiz', label: '퀴즈 게임' },
  { value: 'drawing', label: '그림 그리기' },
  { value: 'ladder', label: '사다리 게임' },
]

export default function InstructorDashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserSession | null>(null)
  const [rooms, setRooms] = useState<GameRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [newRoom, setNewRoom] = useState({
    roomName: '',
    gameType: 'quiz',
    maxParticipants: 30,
  })

  useEffect(() => {
    checkSession()
  }, [])

  const checkSession = async () => {
    try {
      const response = await fetch('/api/auth/me')

      if (!response.ok) {
        router.push('/login')
        return
      }

      const data = await response.json()

      if (data.user.approvalStatus !== 'approved') {
        router.push('/pending')
        return
      }

      setUser(data.user)
      await fetchRooms()
    } catch {
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }

  const fetchRooms = async () => {
    try {
      const response = await fetch('/api/games/rooms')
      if (response.ok) {
        const data = await response.json()
        setRooms(data.rooms || [])
      }
    } catch (error) {
      console.error('Failed to fetch rooms:', error)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/')
    } catch {
      router.push('/')
    }
  }

  const handleCreateRoom = async () => {
    if (!newRoom.roomName.trim()) {
      toast.error('방 이름을 입력해주세요.')
      return
    }

    setCreateLoading(true)

    try {
      const response = await fetch('/api/games/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRoom),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || '방 생성에 실패했습니다.')
        return
      }

      toast.success(`게임 방이 생성되었습니다! 코드: ${data.room.room_code}`)
      setShowCreateModal(false)
      setNewRoom({ roomName: '', gameType: 'quiz', maxParticipants: 30 })
      await fetchRooms()
    } catch {
      toast.error('방 생성 중 오류가 발생했습니다.')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleManageRoom = (roomId: string) => {
    router.push(`/room/${roomId}`)
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
              {user?.name}님
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
            <Card
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setShowCreateModal(true)}
            >
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
                  <Button onClick={() => setShowCreateModal(true)}>
                    첫 번째 게임 방 만들기
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {rooms.map((room) => (
                    <div
                      key={room.id}
                      className="p-4 border rounded-lg hover:bg-muted/50 transition-colors flex justify-between"
                    >
                      <div>
                        <h3 className="font-semibold text-lg mb-1">{room.room_name}</h3>
                        <p className="text-sm text-muted-foreground">
                          방 코드: <span className="font-mono font-bold text-primary">{room.room_code}</span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          게임: {GAME_TYPES.find(g => g.value === room.game_type)?.label || room.game_type}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          size="sm"
                          className={`w-16 justify-center ${
                            room.status === 'in_progress'
                              ? 'bg-green-500 hover:bg-green-600 text-white'
                              : room.status === 'waiting'
                              ? 'bg-yellow-400 hover:bg-yellow-500 text-yellow-900'
                              : 'bg-gray-400 hover:bg-gray-500 text-white'
                          }`}
                          disabled
                        >
                          {room.status === 'in_progress' ? '진행중' : room.status === 'waiting' ? '대기중' : '종료'}
                        </Button>
                        <Button
                          size="sm"
                          className="w-16 justify-center bg-blue-500 hover:bg-blue-600 text-white"
                          onClick={() => handleManageRoom(room.id)}
                        >
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

      {/* 방 생성 모달 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>새 게임 방 만들기</CardTitle>
              <CardDescription>게임 방 정보를 입력하세요</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">방 이름</label>
                <Input
                  placeholder="예: 1교시 아이스브레이킹"
                  value={newRoom.roomName}
                  onChange={(e) => setNewRoom({ ...newRoom, roomName: e.target.value })}
                  disabled={createLoading}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">게임 타입</label>
                <select
                  className="w-full p-2 border rounded-md bg-background"
                  value={newRoom.gameType}
                  onChange={(e) => setNewRoom({ ...newRoom, gameType: e.target.value })}
                  disabled={createLoading}
                >
                  {GAME_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">최대 참가자 수</label>
                <Input
                  type="number"
                  min={2}
                  max={100}
                  value={newRoom.maxParticipants}
                  onChange={(e) => setNewRoom({ ...newRoom, maxParticipants: parseInt(e.target.value) || 30 })}
                  disabled={createLoading}
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowCreateModal(false)}
                  disabled={createLoading}
                >
                  취소
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCreateRoom}
                  disabled={createLoading}
                >
                  {createLoading ? '생성 중...' : '생성하기'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
