'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'

interface Participant {
  id: string
  nickname: string
  roomId: string
  roomCode: string
  score?: number
}

interface RoomInfo {
  id: string
  room_code: string
  room_name: string
  game_type: string
  status: string
  current_round_index: number | null
  participant_count: number
}

interface RoundInfo {
  id: string
  round_num: number
  status: string
  drawing_data: string | null
  time_limit: number
  started_at: string | null
}

interface DrawerInfo {
  id: string
  nickname: string
}

interface WordInfo {
  id: string
  word: string
  hint: string | null
}

interface GuessResult {
  is_correct: boolean
  points_earned: number
}

export default function DrawingPlayPage() {
  const params = useParams()
  const code = params.code as string
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [loading, setLoading] = useState(true)

  // 라운드 관련 상태
  const [currentRound, setCurrentRound] = useState<RoundInfo | null>(null)
  const [currentWord, setCurrentWord] = useState<WordInfo | null>(null)
  const [drawer, setDrawer] = useState<DrawerInfo | null>(null)
  const [totalRounds, setTotalRounds] = useState(0)
  const [totalScore, setTotalScore] = useState(0)

  // 그리기 관련 상태
  const [isDrawing, setIsDrawing] = useState(false)
  const [brushColor, setBrushColor] = useState('#000000')
  const [brushSize, setBrushSize] = useState(5)
  const [drawingData, setDrawingData] = useState<string>('')

  // 추측 관련 상태
  const [guessText, setGuessText] = useState('')
  const [guessResult, setGuessResult] = useState<GuessResult | null>(null)
  const [hasGuessedCorrectly, setHasGuessedCorrectly] = useState(false)
  const [submittingGuess, setSubmittingGuess] = useState(false)

  const isMyTurnToDraw = drawer?.id === participant?.id

  const fetchRoomInfo = useCallback(async () => {
    try {
      const response = await fetch(`/api/games/join?code=${code}&include_finished=true`)
      const data = await response.json()

      if (!response.ok) {
        if (data.error !== '이미 종료된 게임입니다.') {
          toast.error(data.error)
          router.push(`/join/${code}`)
          return null
        }
      }

      setRoom(data.room)
      return data.room as RoomInfo
    } catch {
      toast.error('방 정보를 불러오는데 실패했습니다.')
      return null
    }
  }, [code, router])

  const fetchRoundInfo = useCallback(async (roomId: string) => {
    try {
      const response = await fetch(`/api/games/drawing/round?room_id=${roomId}`)
      if (!response.ok) return null

      const data = await response.json()
      setTotalRounds(data.total_rounds || 0)
      setCurrentRound(data.current_round)
      setCurrentWord(data.current_word)
      setDrawer(data.drawer)

      return data
    } catch {
      return null
    }
  }, [])

  const fetchDrawingData = useCallback(async (roundId: string) => {
    try {
      const response = await fetch(`/api/games/drawing/draw?round_id=${roundId}`)
      if (!response.ok) return

      const data = await response.json()
      if (data.drawing_data) {
        setDrawingData(data.drawing_data)
        renderDrawing(data.drawing_data)
      }
    } catch {
      // ignore
    }
  }, [])

  // 캔버스에 그림 렌더링
  const renderDrawing = (data: string) => {
    const canvas = canvasRef.current
    if (!canvas || !data) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
    }
    img.src = data
  }

  useEffect(() => {
    const stored = localStorage.getItem('participant')
    if (!stored) {
      router.push(`/join/${code}`)
      return
    }

    const participantData = JSON.parse(stored) as Participant
    if (participantData.roomCode !== code.toUpperCase()) {
      router.push(`/join/${code}`)
      return
    }

    setParticipant(participantData)
    setTotalScore(participantData.score || 0)

    const init = async () => {
      const roomData = await fetchRoomInfo()
      setLoading(false)

      if (roomData?.game_type === 'drawing' && roomData.status === 'in_progress') {
        await fetchRoundInfo(roomData.id)
      }
    }

    init()
  }, [code, router, fetchRoomInfo, fetchRoundInfo])

  // 폴링
  useEffect(() => {
    if (!participant || !room) return

    const pollInterval = setInterval(async () => {
      const updatedRoom = await fetchRoomInfo()

      if (updatedRoom?.game_type === 'drawing' && updatedRoom.status === 'in_progress') {
        const data = await fetchRoundInfo(updatedRoom.id)

        // 라운드가 변경되면 상태 리셋
        if (data?.current_round?.id !== currentRound?.id) {
          setGuessText('')
          setGuessResult(null)
          setHasGuessedCorrectly(false)
          setDrawingData('')
          const canvas = canvasRef.current
          if (canvas) {
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.fillStyle = 'white'
              ctx.fillRect(0, 0, canvas.width, canvas.height)
            }
          }
        }

        // 내가 그리는 사람이 아니면 그림 데이터 가져오기
        if (data?.current_round && data.drawer?.id !== participant.id) {
          await fetchDrawingData(data.current_round.id)
        }
      }
    }, 2000)

    return () => clearInterval(pollInterval)
  }, [participant, room, currentRound?.id, fetchRoomInfo, fetchRoundInfo, fetchDrawingData])

  // 캔버스 초기화
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = 400
    canvas.height = 400

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }
  }, [])

  // 그리기 핸들러
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isMyTurnToDraw || currentRound?.status !== 'drawing') return
    setIsDrawing(true)
    draw(e)
  }

  const stopDrawing = async () => {
    if (!isDrawing) return
    setIsDrawing(false)

    // 그림 데이터 저장
    const canvas = canvasRef.current
    if (canvas && currentRound && participant) {
      const data = canvas.toDataURL('image/png')
      try {
        await fetch('/api/games/drawing/draw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            round_id: currentRound.id,
            participant_id: participant.id,
            drawing_data: data,
          }),
        })
      } catch {
        // ignore
      }
    }
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isMyTurnToDraw) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    ctx.strokeStyle = brushColor
    ctx.lineWidth = brushSize
    ctx.lineTo(x, y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  }

  // 추측 제출
  const handleSubmitGuess = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!guessText.trim() || !participant || !currentRound || submittingGuess || hasGuessedCorrectly) return

    setSubmittingGuess(true)

    try {
      const response = await fetch('/api/games/drawing/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          round_id: currentRound.id,
          participant_id: participant.id,
          guess_text: guessText.trim(),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || '추측 제출에 실패했습니다.')
        return
      }

      setGuessResult(data.guess)

      if (data.guess.is_correct) {
        toast.success(`정답! +${data.guess.points_earned}점`)
        setTotalScore((prev) => prev + data.guess.points_earned)
        setHasGuessedCorrectly(true)

        // 로컬 스토리지 업데이트
        const stored = localStorage.getItem('participant')
        if (stored) {
          const storedData = JSON.parse(stored)
          storedData.score = totalScore + data.guess.points_earned
          localStorage.setItem('participant', JSON.stringify(storedData))
        }
      } else {
        toast.error('틀렸습니다!')
      }

      setGuessText('')
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setSubmittingGuess(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-100">
        <div className="text-lg">로딩 중...</div>
      </div>
    )
  }

  if (!room || !participant) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 dark:from-gray-900 dark:to-gray-800">
      <header className="border-b bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="text-xl font-bold text-primary">
            MetisLap
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm">
              <span className="font-medium">{participant.nickname}</span>
              <span className="ml-2 text-muted-foreground">{totalScore}점</span>
            </span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-2xl">🎨</span>
              {room.room_name}
            </CardTitle>
            <CardDescription>
              그림 그리기 게임 | 라운드 {currentRound?.round_num || 0} / {totalRounds}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* 대기 중 */}
        {room.status === 'waiting' && (
          <Card className="text-center py-12">
            <CardContent>
              <div className="text-6xl mb-4">⏳</div>
              <h2 className="text-2xl font-bold mb-2">게임 대기 중</h2>
              <p className="text-muted-foreground">
                강사가 게임을 시작하면 자동으로 시작됩니다.
              </p>
            </CardContent>
          </Card>
        )}

        {/* 게임 진행 중 */}
        {room.status === 'in_progress' && currentRound && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* 캔버스 영역 */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {isMyTurnToDraw ? '당신이 그립니다!' : `${drawer?.nickname}님이 그리는 중...`}
                </CardTitle>
                {isMyTurnToDraw && currentWord && (
                  <CardDescription className="text-lg font-bold text-primary">
                    제시어: {currentWord.word}
                    {currentWord.hint && (
                      <span className="text-sm font-normal text-muted-foreground ml-2">
                        (힌트: {currentWord.hint})
                      </span>
                    )}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <canvas
                  ref={canvasRef}
                  className="border rounded-lg cursor-crosshair w-full max-w-[400px] mx-auto"
                  style={{ touchAction: 'none' }}
                  onMouseDown={startDrawing}
                  onMouseUp={stopDrawing}
                  onMouseOut={stopDrawing}
                  onMouseMove={draw}
                />

                {/* 그리기 도구 (내 차례일 때만) */}
                {isMyTurnToDraw && (
                  <div className="mt-4 flex flex-wrap items-center gap-4 justify-center">
                    <div className="flex items-center gap-2">
                      <label className="text-sm">색상:</label>
                      <input
                        type="color"
                        value={brushColor}
                        onChange={(e) => setBrushColor(e.target.value)}
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm">굵기:</label>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                        className="w-24"
                      />
                    </div>
                    <Button variant="outline" size="sm" onClick={clearCanvas}>
                      지우기
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 추측 영역 (내 차례가 아닐 때만) */}
            {!isMyTurnToDraw && (
              <Card>
                <CardHeader>
                  <CardTitle>정답 맞추기</CardTitle>
                  <CardDescription>그림을 보고 정답을 입력하세요!</CardDescription>
                </CardHeader>
                <CardContent>
                  {hasGuessedCorrectly ? (
                    <div className="text-center py-8">
                      <div className="text-6xl mb-4">🎉</div>
                      <h3 className="text-xl font-bold text-green-600">정답을 맞추셨습니다!</h3>
                      <p className="text-muted-foreground mt-2">
                        다음 라운드를 기다려주세요.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmitGuess} className="space-y-4">
                      <Input
                        value={guessText}
                        onChange={(e) => setGuessText(e.target.value)}
                        placeholder="정답을 입력하세요"
                        autoFocus
                      />
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={!guessText.trim() || submittingGuess}
                      >
                        {submittingGuess ? '제출 중...' : '제출'}
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 그리는 사람일 때의 안내 */}
            {isMyTurnToDraw && (
              <Card>
                <CardHeader>
                  <CardTitle>그리기 안내</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-yellow-50 rounded-lg">
                    <p className="text-yellow-800">
                      <strong>제시어를 그림으로 표현하세요!</strong>
                    </p>
                    <p className="text-sm text-yellow-700 mt-2">
                      다른 참가자들이 맞출 수 있도록 그려주세요.
                      글자를 쓰면 안 됩니다!
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>• 왼쪽 캔버스에 그림을 그리세요</p>
                    <p>• 색상과 굵기를 조절할 수 있습니다</p>
                    <p>• 다른 참가자가 정답을 맞추면 점수를 얻습니다</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* 게임 종료 */}
        {room.status === 'finished' && (
          <Card className="text-center py-12">
            <CardContent>
              <div className="text-6xl mb-4">🏆</div>
              <h2 className="text-2xl font-bold mb-2">게임 종료!</h2>
              <p className="text-4xl font-bold text-primary mb-4">{totalScore}점</p>
              <p className="text-muted-foreground">
                수고하셨습니다!
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
