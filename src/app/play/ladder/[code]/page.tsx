'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'
import { apiFetch } from '@/lib/utils/api'

interface Participant {
  id: string
  nickname: string
  score: number
}

interface RoomInfo {
  id: string
  room_code: string
  room_name: string
  game_type: string
  status: 'waiting' | 'in_progress' | 'finished'
}

interface LadderItem {
  id: string
  item_text: string
  position: number
}

interface LadderSelection {
  id: string
  participant_id: string
  start_position: number
  result_position: number | null
  is_revealed: boolean
  game_participants?: { nickname: string }
}

interface LadderGameState {
  ladder_data: {
    lines_count: number
    horizontal_lines: { row: number; fromCol: number }[]
  } | null
  selections: LadderSelection[]
  items: LadderItem[]
}

export default function LadderPlayPage() {
  const params = useParams()
  const code = params.code as string
  const router = useRouter()

  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [ladderGame, setLadderGame] = useState<LadderGameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectingPosition, setSelectingPosition] = useState<number | null>(null)
  const [mySelection, setMySelection] = useState<LadderSelection | null>(null)

  useEffect(() => {
    const storedParticipant = localStorage.getItem('participant')
    if (!storedParticipant) {
      router.replace(`/join/${code}`)
      return
    }

    const parsed = JSON.parse(storedParticipant)
    // 방 코드가 일치하는지 확인
    if (parsed.roomCode !== code.toUpperCase()) {
      router.replace(`/join/${code}`)
      return
    }

    setParticipant(parsed)
    fetchRoomInfo()
  }, [code])

  // 폴링
  useEffect(() => {
    if (!room || room.status === 'finished') return

    const interval = setInterval(() => {
      fetchRoomInfo()
      if (room.status === 'in_progress') {
        fetchLadderGame()
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [room?.status])

  useEffect(() => {
    if (room?.status === 'in_progress') {
      fetchLadderGame()
    }
  }, [room?.status])

  const fetchRoomInfo = async () => {
    try {
      const response = await fetch(`/api/games/join?code=${code}&include_finished=true`)
      if (!response.ok) {
        toast.error('방 정보를 불러올 수 없습니다.')
        router.replace('/')
        return
      }

      const data = await response.json()
      setRoom(data.room)

      // 사다리 게임이 아니면 리다이렉트
      if (data.room.game_type !== 'ladder') {
        if (data.room.game_type === 'drawing') {
          router.replace(`/play/drawing/${code}`)
        } else {
          router.replace(`/play/${code}`)
        }
        return
      }
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const fetchLadderGame = async () => {
    if (!room) return

    try {
      const response = await fetch(`/api/games/ladder/game?room_id=${room.id}`)
      if (response.ok) {
        const data = await response.json()
        setLadderGame(data)

        // 내 선택 찾기
        if (participant) {
          const mySelect = data.selections.find(
            (s: LadderSelection) => s.participant_id === participant.id
          )
          setMySelection(mySelect || null)
        }
      }
    } catch (error) {
      console.error('Failed to fetch ladder game:', error)
    }
  }

  const handleSelectPosition = async (position: number) => {
    if (!room || !participant || mySelection) return

    setSelectingPosition(position)
    try {
      const response = await apiFetch('/api/games/ladder/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: room.id,
          participant_id: participant.id,
          start_position: position,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || '선택에 실패했습니다.')
        return
      }

      toast.success('출발점을 선택했습니다!')
      await fetchLadderGame()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setSelectingPosition(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-lg">로딩 중...</div>
      </div>
    )
  }

  if (!room || !participant) {
    return null
  }

  // 대기 중
  if (room.status === 'waiting') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur-sm">
          <div className="px-3 py-2 flex justify-between items-center max-w-lg mx-auto">
            <span className="font-medium text-base">{room.room_name} 🪜</span>
          </div>
        </header>

        <main className="px-3 py-3 max-w-lg mx-auto">
          <Card>
            <CardContent className="py-8 text-center">
              <div className="text-4xl mb-4">⏳</div>
              <h2 className="text-lg font-bold mb-2">게임 대기 중</h2>
              <p className="text-sm text-muted-foreground mb-4">
                강사가 게임을 시작할 때까지 기다려주세요
              </p>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">참가자</p>
                <p className="font-medium">{participant.nickname}</p>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  // 게임 종료
  if (room.status === 'finished') {
    const myResult = mySelection?.is_revealed && mySelection?.result_position !== null
      ? ladderGame?.items.find(i => i.position === mySelection.result_position)
      : null

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur-sm">
          <div className="px-3 py-2 flex justify-between items-center max-w-lg mx-auto">
            <span className="font-medium text-base">{room.room_name} 🪜</span>
          </div>
        </header>

        <main className="px-3 py-3 max-w-lg mx-auto">
          <Card>
            <CardContent className="py-8 text-center">
              <div className="text-4xl mb-4">🏆</div>
              <h2 className="text-lg font-bold mb-2">게임 종료!</h2>
              {myResult ? (
                <>
                  <p className="text-sm text-muted-foreground mb-2">나의 결과</p>
                  <p className="text-2xl font-bold text-primary">{myResult.item_text}</p>
                </>
              ) : mySelection ? (
                <p className="text-sm text-muted-foreground">결과가 공개되지 않았습니다</p>
              ) : (
                <p className="text-sm text-muted-foreground">선택하지 않았습니다</p>
              )}
              <Link href="/" className="block mt-6">
                <Button variant="outline">홈으로 돌아가기</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  // 게임 진행 중
  const linesCount = ladderGame?.ladder_data?.lines_count || 0
  const selectedPositions = ladderGame?.selections.map(s => s.start_position) || []

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur-sm">
        <div className="px-3 py-2 flex justify-between items-center max-w-lg mx-auto">
          <span className="font-medium text-base">{room.room_name} 🪜</span>
          <span className="text-sm text-muted-foreground">{participant.nickname}</span>
        </div>
      </header>

      <main className="px-3 py-3 max-w-lg mx-auto space-y-4">
        {/* 출발점 선택 */}
        {!mySelection ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">출발점을 선택하세요</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                원하는 번호를 클릭하세요 (선착순)
              </p>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: linesCount }, (_, i) => {
                  const isTaken = selectedPositions.includes(i)
                  return (
                    <Button
                      key={i}
                      variant={isTaken ? 'outline' : 'default'}
                      className={`h-12 text-lg ${isTaken ? 'opacity-50' : ''}`}
                      disabled={isTaken || selectingPosition !== null}
                      onClick={() => handleSelectPosition(i)}
                    >
                      {selectingPosition === i ? '...' : i + 1}
                    </Button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                선택 현황: {selectedPositions.length} / {linesCount}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-6 text-center">
              <div className="text-3xl mb-3">✅</div>
              <h2 className="text-base font-bold mb-2">선택 완료!</h2>
              <p className="text-sm text-muted-foreground mb-4">
                결과 공개를 기다려주세요
              </p>
              <div className="p-3 bg-blue-100 rounded-lg inline-block">
                <p className="text-xs text-blue-600">내가 선택한 번호</p>
                <p className="text-2xl font-bold text-blue-700">{mySelection.start_position + 1}</p>
              </div>

              {/* 결과가 공개된 경우 */}
              {mySelection.is_revealed && mySelection.result_position !== null && (
                <div className="mt-4 p-4 bg-green-100 rounded-lg">
                  <p className="text-xs text-green-600 mb-1">나의 결과</p>
                  <p className="text-xl font-bold text-green-700">
                    {ladderGame?.items.find(i => i.position === mySelection.result_position)?.item_text || '???'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 전체 현황 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">참가자 현황</CardTitle>
          </CardHeader>
          <CardContent>
            {ladderGame?.selections.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                아직 선택한 참가자가 없습니다
              </p>
            ) : (
              <div className="space-y-2">
                {ladderGame?.selections.map((selection) => {
                  const resultItem = selection.is_revealed && selection.result_position !== null
                    ? ladderGame.items.find(i => i.position === selection.result_position)
                    : null
                  const isMe = selection.participant_id === participant.id

                  return (
                    <div
                      key={selection.id}
                      className={`p-2 rounded-lg flex justify-between items-center text-sm ${
                        isMe ? 'bg-blue-50 border border-blue-200' : 'bg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
                          {selection.start_position + 1}
                        </span>
                        <span className={isMe ? 'font-bold' : ''}>
                          {selection.game_participants?.nickname || '알 수 없음'}
                          {isMe && ' (나)'}
                        </span>
                      </div>
                      {selection.is_revealed && resultItem && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                          {resultItem.item_text}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 결과 항목 미리보기 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">도착 결과</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {ladderGame?.items.map((item, idx) => {
                const revealedSelection = ladderGame.selections.find(
                  s => s.is_revealed && s.result_position === item.position
                )
                return (
                  <div
                    key={item.id}
                    className={`p-2 rounded-lg text-center text-xs ${
                      revealedSelection
                        ? 'bg-green-100 text-green-700 border border-green-300'
                        : 'bg-muted'
                    }`}
                  >
                    <span className="font-medium">{idx + 1}. {item.item_text}</span>
                    {revealedSelection && (
                      <p className="text-xs mt-0.5 opacity-75">
                        {revealedSelection.game_participants?.nickname}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
