'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import toast from 'react-hot-toast'

interface GameRoom {
  id: string
  room_code: string
  room_name: string
  game_type: string
  max_participants: number
  status: 'waiting' | 'in_progress' | 'finished'
  participant_count: number
  created_at: string
  started_at: string | null
  ended_at: string | null
}

const GAME_TYPES: Record<string, string> = {
  quiz: '퀴즈 게임',
  drawing: '그림 그리기',
  word_chain: '단어 연상',
  speed_quiz: '스피드 퀴즈',
  voting: '투표 게임',
}

export default function RoomManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [room, setRoom] = useState<GameRoom | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    fetchRoom()
  }, [id])

  const fetchRoom = async () => {
    try {
      const response = await fetch(`/api/games/rooms/${id}`)

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login')
          return
        }
        toast.error('게임 방을 찾을 수 없습니다.')
        router.push('/dashboard')
        return
      }

      const data = await response.json()
      setRoom(data.room)
    } catch {
      toast.error('오류가 발생했습니다.')
      router.push('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (newStatus: 'waiting' | 'in_progress' | 'finished') => {
    setActionLoading(true)

    try {
      const response = await fetch(`/api/games/rooms/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) {
        toast.error('상태 변경에 실패했습니다.')
        return
      }

      const statusText = newStatus === 'in_progress' ? '시작' : newStatus === 'finished' ? '종료' : '대기'
      toast.success(`게임이 ${statusText}되었습니다.`)
      await fetchRoom()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('정말로 이 게임 방을 삭제하시겠습니까?')) {
      return
    }

    setActionLoading(true)

    try {
      const response = await fetch(`/api/games/rooms/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || '삭제에 실패했습니다.')
        return
      }

      toast.success('게임 방이 삭제되었습니다.')
      router.push('/dashboard')
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  const copyRoomCode = () => {
    if (room) {
      navigator.clipboard.writeText(room.room_code)
      toast.success('방 코드가 복사되었습니다!')
    }
  }

  const copyJoinUrl = () => {
    if (room) {
      const url = `${window.location.origin}/join/${room.room_code}`
      navigator.clipboard.writeText(url)
      toast.success('참여 링크가 복사되었습니다!')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-lg">로딩 중...</div>
      </div>
    )
  }

  if (!room) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <header className="border-b bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="text-xl font-bold text-primary">
            MetisLap
          </Link>
          <Link href="/dashboard">
            <Button variant="outline" size="sm">
              대시보드로 돌아가기
            </Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-bold">{room.room_name}</h1>
            <span
              className={`px-3 py-1 text-sm rounded-full ${
                room.status === 'in_progress'
                  ? 'bg-green-100 text-green-700'
                  : room.status === 'waiting'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {room.status === 'in_progress' ? '진행중' : room.status === 'waiting' ? '대기중' : '종료'}
            </span>
          </div>
          <p className="text-muted-foreground">
            {GAME_TYPES[room.game_type] || room.game_type}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* 방 정보 */}
          <Card>
            <CardHeader>
              <CardTitle>방 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">방 코드</p>
                  <p className="text-3xl font-mono font-bold">{room.room_code}</p>
                </div>
                <Button onClick={copyRoomCode} variant="outline">
                  복사
                </Button>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">참여 링크</span>
                <Button onClick={copyJoinUrl} variant="outline" size="sm">
                  링크 복사
                </Button>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">최대 참가자</span>
                <span>{room.max_participants}명</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">현재 참가자</span>
                <span>{room.participant_count}명</span>
              </div>
            </CardContent>
          </Card>

          {/* 게임 컨트롤 */}
          <Card>
            <CardHeader>
              <CardTitle>게임 컨트롤</CardTitle>
              <CardDescription>게임 상태를 관리하세요</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {room.status === 'waiting' && (
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  size="lg"
                  onClick={() => handleStatusChange('in_progress')}
                  disabled={actionLoading}
                >
                  게임 시작하기
                </Button>
              )}
              {room.status === 'in_progress' && (
                <Button
                  className="w-full"
                  size="lg"
                  variant="destructive"
                  onClick={() => handleStatusChange('finished')}
                  disabled={actionLoading}
                >
                  게임 종료하기
                </Button>
              )}
              {room.status === 'finished' && (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => handleStatusChange('waiting')}
                  disabled={actionLoading}
                >
                  다시 대기 상태로
                </Button>
              )}
              <hr />
              <Button
                className="w-full"
                variant="outline"
                onClick={handleDelete}
                disabled={actionLoading || room.status === 'in_progress'}
              >
                게임 방 삭제
              </Button>
              {room.status === 'in_progress' && (
                <p className="text-xs text-muted-foreground text-center">
                  진행 중인 게임은 삭제할 수 없습니다
                </p>
              )}
            </CardContent>
          </Card>

          {/* 참가자 목록 */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>참가자 목록</CardTitle>
              <CardDescription>현재 방에 참여 중인 학생들</CardDescription>
            </CardHeader>
            <CardContent>
              {room.participant_count === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>아직 참가자가 없습니다.</p>
                  <p className="text-sm mt-2">
                    학생들에게 방 코드 <span className="font-mono font-bold">{room.room_code}</span>를 공유하세요!
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">참가자 목록 기능 준비 중...</p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
