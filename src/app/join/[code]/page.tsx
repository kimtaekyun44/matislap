'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import toast from 'react-hot-toast'
import { apiFetch } from '@/lib/utils/api'

interface RoomInfo {
  id: string
  room_code: string
  room_name: string
  game_type: string
  status: string
  max_participants: number
  participant_count: number
}

const GAME_TYPES: Record<string, string> = {
  quiz: '퀴즈 게임',
  drawing: '그림 그리기',
  ladder: '사다리 게임',
  survey: '설문조사',
}

export default function JoinRoomPage() {
  const params = useParams()
  const code = params.code as string
  const router = useRouter()
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchRoomInfo()
  }, [code])

  const fetchRoomInfo = async () => {
    try {
      const response = await apiFetch(`/api/games/join?code=${code}`)
      const data = await response.json()

      if (!response.ok) {
        setError(data.error)
        return
      }

      setRoom(data.room)
    } catch {
      setError('방 정보를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!nickname.trim()) {
      toast.error('닉네임을 입력해주세요.')
      return
    }

    if (nickname.length < 2 || nickname.length > 20) {
      toast.error('닉네임은 2~20자 사이로 입력해주세요.')
      return
    }

    setJoining(true)

    try {
      const response = await apiFetch('/api/games/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode: code,
          nickname: nickname.trim(),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error)
        return
      }

      // 참가자 정보를 로컬 스토리지에 저장
      localStorage.setItem('participant', JSON.stringify({
        id: data.participant.id,
        nickname: data.participant.nickname,
        roomId: data.room.id,
        roomCode: data.room.room_code,
      }))

      toast.success('게임에 참여했습니다!')
      router.push(`/play/${data.room.room_code}`)
    } catch {
      toast.error('참여 중 오류가 발생했습니다.')
    } finally {
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-100 dark:from-gray-900 dark:to-gray-800 px-4">
        <div className="text-base">방 정보 확인 중...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-100 dark:from-gray-900 dark:to-gray-800 px-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader className="pb-2">
            <div className="text-5xl mb-2">😢</div>
            <CardTitle className="text-lg text-red-600">참여할 수 없습니다</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
          <CardFooter>
            <Link href="/" className="w-full">
              <Button variant="outline" className="w-full">
                메인으로
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  }

  if (!room) {
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-100 dark:from-gray-900 dark:to-gray-800 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-2">
          <div className="text-3xl mb-1">🎮</div>
          <CardTitle className="text-xl">{room.room_name}</CardTitle>
          <CardDescription className="text-sm">
            {GAME_TYPES[room.game_type] || room.game_type}
            <span className="mx-2">•</span>
            <span>{room.participant_count}/{room.max_participants}명</span>
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleJoin}>
          <CardContent className="space-y-3">
            <div className="p-3 bg-muted rounded-lg text-center">
              <p className="text-xs text-muted-foreground">방 코드</p>
              <p className="text-xl font-mono font-bold">{room.room_code}</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">닉네임</label>
              <Input
                placeholder="닉네임을 입력하세요"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                disabled={joining}
                autoFocus
                className="text-base"
              />
            </div>
            {room.status === 'in_progress' && (
              <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  게임이 진행 중입니다. 중간부터 참여합니다.
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-2 pt-2">
            <Button
              type="submit"
              className="w-full"
              disabled={joining}
            >
              {joining ? '참여 중...' : '참여하기'}
            </Button>
            <Link href="/" className="text-xs text-muted-foreground hover:underline">
              ← 메인으로
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
