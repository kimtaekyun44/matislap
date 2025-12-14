'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'
import { apiFetch } from '@/lib/utils/api'

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
      const response = await apiFetch(`/api/games/join?code=${code}&include_finished=true`)
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
      const response = await apiFetch(`/api/games/drawing/round?room_id=${roomId}`)
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
      const response = await apiFetch(`/api/games/drawing/draw?round_id=${roundId}`)
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

      if (roomData?.game_type === 'drawing') {
        await fetchRoundInfo(roomData.id)
      }
    }

    init()
  }, [code, router, fetchRoomInfo, fetchRoundInfo])

  // 폴링
  useEffect(() => {
    if (!participant) return

    const pollInterval = setInterval(async () => {
      const updatedRoom = await fetchRoomInfo()

      if (updatedRoom?.game_type === 'drawing') {
        // 게임이 진행 중이면 라운드 정보 가져오기
        if (updatedRoom.status === 'in_progress') {
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
      }
    }, 2000)

    return () => clearInterval(pollInterval)
  }, [participant, currentRound?.id, fetchRoomInfo, fetchRoundInfo, fetchDrawingData])

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

  // 좌표 계산 헬퍼 함수
  const getCanvasCoordinates = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    }
  }

  // 그리기 핸들러 - 마우스
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isMyTurnToDraw || currentRound?.status !== 'drawing') return

    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        const { x, y } = getCanvasCoordinates(canvas, e.clientX, e.clientY)
        ctx.beginPath()
        ctx.moveTo(x, y)
      }
    }

    setIsDrawing(true)
  }

  // 그리기 핸들러 - 터치
  const startDrawingTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isMyTurnToDraw || currentRound?.status !== 'drawing') return
    e.preventDefault()

    const canvas = canvasRef.current
    if (canvas && e.touches.length > 0) {
      const touch = e.touches[0]
      const ctx = canvas.getContext('2d')
      if (ctx) {
        const { x, y } = getCanvasCoordinates(canvas, touch.clientX, touch.clientY)
        ctx.beginPath()
        ctx.moveTo(x, y)
      }
    }

    setIsDrawing(true)
  }

  const stopDrawing = async () => {
    if (!isDrawing) return
    setIsDrawing(false)

    const canvas = canvasRef.current
    if (!canvas) return

    // 경로 종료
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.beginPath()
    }

    // 그림 데이터 저장
    if (currentRound && participant) {
      const data = canvas.toDataURL('image/png')
      try {
        await apiFetch('/api/games/drawing/draw', {
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

  const stopDrawingTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    stopDrawing()
  }

  // 그리기 - 마우스
  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isMyTurnToDraw) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { x, y } = getCanvasCoordinates(canvas, e.clientX, e.clientY)

    ctx.strokeStyle = brushColor
    ctx.lineWidth = brushSize
    ctx.lineTo(x, y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  // 그리기 - 터치
  const drawTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isMyTurnToDraw) return
    e.preventDefault()

    const canvas = canvasRef.current
    if (!canvas || e.touches.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const touch = e.touches[0]
    const { x, y } = getCanvasCoordinates(canvas, touch.clientX, touch.clientY)

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
      const response = await apiFetch('/api/games/drawing/guess', {
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
        <div className="text-base">로딩 중...</div>
      </div>
    )
  }

  if (!room || !participant) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 dark:from-gray-900 dark:to-gray-800">
      <header className="border-b bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-3 py-2 flex justify-between items-center max-w-lg">
          <span className="text-base font-bold text-primary">🎨 {room.room_name}</span>
          <span className="text-sm">
            <span className="font-medium">{participant.nickname}</span>
            <span className="ml-1 text-muted-foreground">{totalScore}점</span>
          </span>
        </div>
      </header>

      <main className="container mx-auto px-3 py-3 max-w-lg">
        {/* 라운드 정보 */}
        <div className="text-center text-sm text-muted-foreground mb-2">
          라운드 {currentRound?.round_num || 0} / {totalRounds}
        </div>

        {/* 대기 중 */}
        {room.status === 'waiting' && (
          <Card className="text-center py-8">
            <CardContent>
              <div className="text-4xl mb-2">⏳</div>
              <h2 className="text-lg font-bold mb-1">게임 대기 중</h2>
              <p className="text-sm text-muted-foreground">
                강사가 게임을 시작하면 시작됩니다
              </p>
            </CardContent>
          </Card>
        )}

        {/* 게임 진행 중 - 라운드 로딩 중 */}
        {room.status === 'in_progress' && !currentRound && (
          <Card className="text-center py-8">
            <CardContent>
              <div className="text-4xl mb-2">🎨</div>
              <h2 className="text-lg font-bold mb-1">게임 로딩 중...</h2>
              <p className="text-sm text-muted-foreground">
                라운드 정보를 불러오는 중입니다
              </p>
            </CardContent>
          </Card>
        )}

        {/* 게임 진행 중 */}
        {room.status === 'in_progress' && currentRound && (
          <div className="space-y-3">
            {/* 캔버스 영역 */}
            <Card>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-base text-center">
                  {isMyTurnToDraw ? '당신이 그립니다!' : `${drawer?.nickname}님이 그리는 중`}
                </CardTitle>
                {isMyTurnToDraw && currentWord && (
                  <div className="text-center">
                    <span className="text-lg font-bold text-primary">제시어: {currentWord.word}</span>
                    {currentWord.hint && (
                      <span className="text-xs text-muted-foreground ml-1">(힌트: {currentWord.hint})</span>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <canvas
                  ref={canvasRef}
                  className="border rounded-lg cursor-crosshair w-full select-none"
                  style={{ touchAction: 'none' }}
                  onMouseDown={startDrawing}
                  onMouseUp={stopDrawing}
                  onMouseOut={stopDrawing}
                  onMouseMove={draw}
                  onTouchStart={startDrawingTouch}
                  onTouchEnd={stopDrawingTouch}
                  onTouchCancel={stopDrawingTouch}
                  onTouchMove={drawTouch}
                  onDoubleClick={(e) => e.preventDefault()}
                />

                {/* 그리기 도구 (내 차례일 때만) */}
                {isMyTurnToDraw && (
                  <div className="mt-3 space-y-2">
                    {/* 색상 팔레트 */}
                    <div className="flex flex-wrap items-center gap-1.5 justify-center">
                      {['#000000', '#ffffff', '#ff0000', '#ff9800', '#ffeb3b', '#4caf50', '#2196f3', '#9c27b0', '#795548', '#607d8b'].map((color) => (
                        <button
                          key={color}
                          onClick={() => setBrushColor(color)}
                          className={`w-7 h-7 rounded-full border-2 transition-transform ${
                            brushColor === color ? 'border-primary scale-110' : 'border-gray-300'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    {/* 굵기 및 지우기 */}
                    <div className="flex items-center justify-center gap-3">
                      <div className="flex items-center gap-1">
                        <span className="text-xs">굵기</span>
                        <input
                          type="range"
                          min="1"
                          max="20"
                          value={brushSize}
                          onChange={(e) => setBrushSize(Number(e.target.value))}
                          className="w-20"
                        />
                        <span className="text-xs w-4">{brushSize}</span>
                      </div>
                      <Button variant="outline" size="sm" onClick={clearCanvas}>
                        지우기
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 추측 영역 (내 차례가 아닐 때만) */}
            {!isMyTurnToDraw && (
              <Card>
                <CardContent className="py-3">
                  {hasGuessedCorrectly ? (
                    <div className="text-center py-4">
                      <div className="text-3xl mb-2">🎉</div>
                      <h3 className="text-base font-bold text-green-600">정답!</h3>
                      <p className="text-xs text-muted-foreground">다음 라운드를 기다려주세요</p>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmitGuess} className="flex gap-2">
                      <Input
                        value={guessText}
                        onChange={(e) => setGuessText(e.target.value)}
                        placeholder="정답 입력"
                        className="flex-1 text-base"
                      />
                      <Button
                        type="submit"
                        disabled={!guessText.trim() || submittingGuess}
                      >
                        {submittingGuess ? '...' : '제출'}
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 그리는 사람일 때의 안내 */}
            {isMyTurnToDraw && (
              <div className="p-3 bg-yellow-50 rounded-lg">
                <p className="text-xs text-yellow-800 text-center">
                  <strong>제시어를 그림으로!</strong> 글자는 쓰면 안 됩니다.
                </p>
              </div>
            )}
          </div>
        )}

        {/* 게임 종료 */}
        {room.status === 'finished' && (
          <Card className="text-center py-8">
            <CardContent>
              <div className="text-4xl mb-2">🏆</div>
              <h2 className="text-lg font-bold mb-1">게임 종료!</h2>
              <p className="text-3xl font-bold text-primary mb-2">{totalScore}점</p>
              <p className="text-sm text-muted-foreground mb-4">수고하셨습니다!</p>
              <Link href="/">
                <Button>메인으로 가기</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
