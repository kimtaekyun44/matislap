'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import toast from 'react-hot-toast'
import { apiFetch } from '@/lib/utils/api'

interface Participant {
  id: string
  nickname: string
  roomId: string
  roomCode: string
}

interface JeopardyQuestion {
  id: string
  category: string
  points: number
  content: string
  answer: string
  question_type: 'short_answer' | '2지선다' | '4지선다'
  options: string[]
  is_used: boolean
}

interface ScoreEntry {
  id: string
  nickname: string
  score: number
  is_active: boolean
}

export default function JeopardyPlayPage() {
  const params = useParams()
  const code = params.code as string
  const router = useRouter()

  const [participant, setParticipant] = useState<Participant | null>(null)
  const [roomStatus, setRoomStatus] = useState<'waiting' | 'in_progress' | 'finished'>('waiting')
  const [roomName, setRoomName] = useState('')
  const [loading, setLoading] = useState(true)

  // 게임 상태
  const [currentQuestion, setCurrentQuestion] = useState<JeopardyQuestion | null>(null)
  const [buzzerWinner, setBuzzerWinner] = useState<{ id: string; nickname: string; score: number } | null>(null)
  const [buzzerAnswer, setBuzzerAnswer] = useState<string | null>(null)
  const [participants, setParticipants] = useState<ScoreEntry[]>([])
  const [roomId, setRoomId] = useState<string>('')

  // 버저 상태
  const [buzzing, setBuzzing] = useState(false)
  const [iWon, setIWon] = useState(false)
  const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null)
  const [shortAnswerText, setShortAnswerText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const prevQuestionIdRef = useRef<string | null>(null)
  const prevBuzzerWinnerRef = useRef<string | null>(null)

  const fetchState = useCallback(async (rId: string) => {
    try {
      const res = await apiFetch(`/api/games/jeopardy/state?room_id=${rId}`)
      if (!res.ok) return
      const data = await res.json()

      setRoomStatus(data.room_status)
      setCurrentQuestion(data.current_question)
      setBuzzerWinner(data.buzzer_winner)
      setBuzzerAnswer(data.buzzer_answer ?? null)
      setParticipants(data.participants || [])

      // 새 문제가 열렸을 때 버저 상태 초기화
      const newQuestionId = data.current_question?.id ?? null
      if (newQuestionId !== prevQuestionIdRef.current) {
        setIWon(false)
        setBuzzing(false)
        setSubmittedAnswer(null)
        setShortAnswerText('')
        prevQuestionIdRef.current = newQuestionId
      }

      // 버저 당첨자가 null로 초기화됐을 때 (오답 판정 후) 내 버저 상태도 리셋
      const newWinnerId = data.buzzer_winner?.id ?? null
      if (newWinnerId !== prevBuzzerWinnerRef.current) {
        if (newWinnerId === null) {
          setIWon(false)
          setBuzzing(false)
          setSubmittedAnswer(null)
          setShortAnswerText('')
        }
        prevBuzzerWinnerRef.current = newWinnerId
      }
    } catch (error) {
      console.error('상태 조회 오류:', error)
    }
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('participant')
    if (!stored) {
      router.push(`/join/${code}`)
      return
    }
    const p = JSON.parse(stored) as Participant
    if (p.roomCode !== code.toUpperCase()) {
      router.push(`/join/${code}`)
      return
    }
    setParticipant(p)

    const init = async () => {
      // 방 정보 조회
      const res = await apiFetch(`/api/games/join?code=${code}&include_finished=true`)
      const data = await res.json()
      if (!res.ok) {
        router.push(`/join/${code}`)
        return
      }
      if (data.room?.game_type !== 'jeopardy') {
        router.push(`/play/${code}`)
        return
      }
      setRoomId(data.room.id)
      setRoomName(data.room.room_name)
      setRoomStatus(data.room.status)
      setLoading(false)

      if (data.room.status === 'in_progress') {
        await fetchState(data.room.id)
      }
    }
    init()
  }, [code, router, fetchState])

  // 폴링 (2초마다)
  useEffect(() => {
    if (!roomId || loading) return
    const interval = setInterval(() => fetchState(roomId), 2000)
    return () => clearInterval(interval)
  }, [roomId, loading, fetchState])

  const handleSubmitAnswer = async (answer: string) => {
    if (!participant || submitting || submittedAnswer) return
    setSubmitting(true)
    try {
      await apiFetch('/api/games/jeopardy/buzzer', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, participant_id: participant.id, answer }),
      })
      setSubmittedAnswer(answer)
    } catch {
      toast.error('답변 제출에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBuzzer = async () => {
    if (!participant || !currentQuestion || buzzing || iWon || buzzerWinner) return
    setBuzzing(true)
    try {
      const res = await apiFetch('/api/games/jeopardy/buzzer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          participant_id: participant.id,
          question_id: currentQuestion.id,
        }),
      })
      const data = await res.json()
      if (data.won) {
        setIWon(true)
        toast.success('버저 선점!')
      } else {
        toast.error('늦었습니다!')
      }
      // 최신 상태 즉시 반영
      await fetchState(roomId)
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setBuzzing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-yellow-50 to-orange-100">
        <div className="text-base">로딩 중...</div>
      </div>
    )
  }

  if (!participant) return null

  const myScore = participants.find(p => p.id === participant.id)?.score ?? 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-100 dark:from-gray-900 dark:to-gray-800">
      {/* 헤더 */}
      <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b sticky top-0 z-10">
        <div className="container mx-auto px-3 py-2 flex justify-between items-center max-w-lg">
          <div>
            <h1 className="text-base font-bold">{roomName}</h1>
            <p className="text-xs text-muted-foreground">제퍼디쇼</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">내 점수</p>
            <p className="font-bold text-base text-primary">{myScore}점</p>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-3 py-3 max-w-lg space-y-3">
        {/* 참가자 정보 */}
        <Card>
          <CardContent className="py-2 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-base">
                  😊
                </div>
                <span className="font-medium text-sm">{participant.nickname}</span>
              </div>
              <span className="font-mono text-sm font-bold">{code.toUpperCase()}</span>
            </div>
          </CardContent>
        </Card>

        {/* 대기 중 */}
        {roomStatus === 'waiting' && (
          <Card className="text-center py-8">
            <CardContent>
              <div className="text-4xl mb-2">⏳</div>
              <h2 className="text-lg font-bold mb-1">제퍼디쇼 대기 중</h2>
              <p className="text-sm text-muted-foreground">강사가 게임을 시작하면 시작됩니다</p>
            </CardContent>
          </Card>
        )}

        {/* 진행 중 */}
        {roomStatus === 'in_progress' && (
          <>
            {currentQuestion ? (
              /* 문제 화면 + 버저 */
              <Card className="overflow-hidden border-2 border-primary">
                <div className="bg-primary text-primary-foreground px-4 py-2 flex justify-between items-center">
                  <span className="text-sm font-bold">{currentQuestion.category}</span>
                  <span className="text-lg font-bold">{currentQuestion.points}점</span>
                </div>
                <CardContent className="pt-4 pb-4 space-y-4">
                  <p className="text-xl font-bold text-center whitespace-pre-wrap leading-relaxed">
                    {currentQuestion.content}
                  </p>

                  {currentQuestion.question_type !== 'short_answer' && (
                    <div className="grid grid-cols-2 gap-2">
                      {currentQuestion.options.map((opt, i) => (
                        <div key={i} className="p-2 bg-muted rounded text-sm text-center">
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 버저 / 답변 영역 */}
                  {buzzerWinner ? (
                    buzzerWinner.id === participant.id ? (
                      /* 내가 선점 → 답변 선택 */
                      submittedAnswer ? (
                        <div className="p-4 rounded-lg text-center bg-yellow-50 border-2 border-yellow-400">
                          <div className="text-3xl mb-1">✋</div>
                          <p className="font-bold text-yellow-700">답변 제출 완료</p>
                          <p className="text-base font-bold mt-1">"{submittedAnswer}"</p>
                          <p className="text-xs text-muted-foreground mt-1">강사의 판정을 기다리세요</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-sm font-bold text-center text-yellow-700">🔔 버저 선점! 답변을 선택하세요</p>
                          {currentQuestion.question_type === 'short_answer' ? (
                            <div className="flex gap-2">
                              <input
                                type="text"
                                className="flex-1 px-3 py-2 border-2 border-yellow-400 rounded-lg text-sm focus:outline-none"
                                placeholder="답변 입력..."
                                value={shortAnswerText}
                                onChange={e => setShortAnswerText(e.target.value)}
                                autoFocus
                              />
                              <button
                                onClick={() => handleSubmitAnswer(shortAnswerText.trim())}
                                disabled={submitting || !shortAnswerText.trim()}
                                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-bold disabled:opacity-50"
                              >
                                제출
                              </button>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-2">
                              {currentQuestion.options.map((opt, i) => (
                                <button
                                  key={i}
                                  onClick={() => handleSubmitAnswer(opt)}
                                  disabled={submitting}
                                  className="py-4 rounded-xl border-2 border-yellow-400 bg-white hover:bg-yellow-50 font-bold text-base active:scale-95 transition-all disabled:opacity-50"
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      /* 다른 사람이 선점 */
                      <div className="p-4 rounded-lg text-center bg-gray-50 border-2 border-gray-200 space-y-1">
                        <div className="text-3xl mb-1">🔕</div>
                        <p className="font-bold text-base">{buzzerWinner.nickname}님이 먼저 눌렀습니다</p>
                        {buzzerAnswer != null ? (
                          <div className="mt-2 px-3 py-2 bg-white border border-gray-300 rounded text-sm font-semibold text-gray-800">
                            제출한 답변: {buzzerAnswer}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">답변 대기 중...</p>
                        )}
                        <p className="text-xs text-muted-foreground">판정 결과를 기다리세요</p>
                      </div>
                    )
                  ) : (
                    <button
                      onClick={handleBuzzer}
                      disabled={buzzing || iWon}
                      className={`w-full py-10 rounded-2xl text-2xl font-bold transition-all active:scale-95 ${
                        buzzing || iWon
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200'
                      }`}
                    >
                      {buzzing ? '전송 중...' : '🔔 버저!'}
                    </button>
                  )}
                </CardContent>
              </Card>
            ) : (
              /* 문제 선택 대기 */
              <Card className="text-center py-8">
                <CardContent>
                  <div className="text-4xl mb-2">🎯</div>
                  <h2 className="text-lg font-bold mb-1">강사가 문제를 선택 중입니다</h2>
                  <p className="text-sm text-muted-foreground">잠시 기다려주세요</p>
                </CardContent>
              </Card>
            )}

            {/* 실시간 점수 순위 */}
            {participants.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">실시간 점수</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {participants.map((p, i) => (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between px-2 py-1.5 rounded ${
                          p.id === participant.id ? 'bg-primary/10' : 'hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm w-5 text-center">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                          </span>
                          <span className={`text-sm ${p.id === participant.id ? 'font-bold' : ''}`}>
                            {p.nickname}
                          </span>
                        </div>
                        <span className={`text-sm font-mono font-bold ${
                          p.score > 0 ? 'text-green-600' : p.score < 0 ? 'text-red-600' : ''
                        }`}>
                          {p.score}점
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* 게임 종료 */}
        {roomStatus === 'finished' && (
          <>
            <Card className="text-center py-6">
              <CardContent>
                <div className="text-4xl mb-2">🏆</div>
                <h2 className="text-xl font-bold mb-1">게임 종료!</h2>
                <p className="text-sm text-muted-foreground mb-3">최종 결과입니다</p>
              </CardContent>
            </Card>

            {participants.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">최종 순위</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {participants.map((p, i) => (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                          i === 0 ? 'bg-yellow-50 border border-yellow-200' :
                          p.id === participant.id ? 'bg-primary/10' : 'bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}위`}
                          </span>
                          <span className={`text-sm ${p.id === participant.id ? 'font-bold' : ''}`}>
                            {p.nickname}
                          </span>
                        </div>
                        <span className={`font-bold ${
                          p.score > 0 ? 'text-green-600' : p.score < 0 ? 'text-red-600' : ''
                        }`}>
                          {p.score}점
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Link href="/" className="block">
              <Button variant="outline" className="w-full">메인으로</Button>
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
