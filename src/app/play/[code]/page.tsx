'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
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
  participant_count: number
}

interface QuizQuestion {
  id: string
  question_text: string
  question_type: 'multiple_choice' | 'ox'
  options: string[]
  time_limit: number
  points: number
  order_num: number
}

interface AnswerResult {
  is_correct: boolean
  points_earned: number
  correct_answer: string
}

const GAME_TYPES: Record<string, string> = {
  quiz: '퀴즈 게임',
  drawing: '그림 그리기',
  ladder: '사다리 게임',
}

export default function PlayPage() {
  const params = useParams()
  const code = params.code as string
  const router = useRouter()
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [loading, setLoading] = useState(true)

  // 퀴즈 관련 상태
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null)
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const [answering, setAnswering] = useState(false)
  const [questionStartTime, setQuestionStartTime] = useState<number>(0)
  const [totalScore, setTotalScore] = useState(0)
  const [totalQuestions, setTotalQuestions] = useState<number>(0)
  const [answeredCount, setAnsweredCount] = useState<number>(0) // 개인별 답변 수
  const [quizCompleted, setQuizCompleted] = useState(false) // 모든 문제 완료 여부

  const fetchRoomInfo = useCallback(async () => {
    try {
      const response = await fetch(`/api/games/join?code=${code}&include_finished=true`)
      const data = await response.json()

      if (!response.ok) {
        // 종료된 게임이 아닌 다른 에러인 경우만 리다이렉트
        if (data.error !== '이미 종료된 게임입니다.') {
          toast.error(data.error)
          router.push(`/join/${code}`)
          return
        }
      }

      setRoom(data.room)
      return data.room as RoomInfo
    } catch {
      toast.error('방 정보를 불러오는데 실패했습니다.')
      return null
    }
  }, [code, router])

  const fetchCurrentQuestion = useCallback(async (roomId: string, participantId: string) => {
    try {
      const response = await fetch(`/api/games/quiz/status?room_id=${roomId}&participant_id=${participantId}`)
      if (!response.ok) return { question: null, total: 0, answered: 0 }

      const data = await response.json()
      return {
        question: data.current_question as QuizQuestion | null,
        total: data.total_questions as number,
        answered: data.answered_count as number
      }
    } catch {
      return { question: null, total: 0, answered: 0 }
    }
  }, [])

  useEffect(() => {
    // 로컬 스토리지에서 참가자 정보 확인
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

      // 그림 그리기 게임이면 전용 페이지로 리다이렉트
      if (roomData?.game_type === 'drawing') {
        router.replace(`/play/drawing/${code}`)
        return
      }

      // 사다리 게임이면 전용 페이지로 리다이렉트
      if (roomData?.game_type === 'ladder') {
        router.replace(`/play/ladder/${code}`)
        return
      }

      setLoading(false)

      if (roomData?.game_type === 'quiz' && roomData.status === 'in_progress') {
        const { question, total, answered } = await fetchCurrentQuestion(roomData.id, participantData.id)
        setTotalQuestions(total)
        setAnsweredCount(answered)
        if (question) {
          setCurrentQuestion(question)
          setTimeLeft(question.time_limit)
          setQuestionStartTime(Date.now())
        } else if (answered >= total && total > 0) {
          // 모든 문제 완료
          setQuizCompleted(true)
        }
      }
    }

    init()
  }, [code, router, fetchRoomInfo, fetchCurrentQuestion])

  // 3초마다 방 상태 폴링 (게임 종료 감지용)
  useEffect(() => {
    if (!participant || !room) return

    const pollInterval = setInterval(async () => {
      const updatedRoom = await fetchRoomInfo()

      if (updatedRoom?.status === 'finished') {
        // 게임 종료
        setCurrentQuestion(null)
        setQuizCompleted(false)
      } else if (updatedRoom?.game_type === 'quiz' && updatedRoom.status === 'in_progress') {
        // 현재 문제가 없고 퀴즈 완료 상태가 아닌 경우에만 새 문제 체크
        if (!currentQuestion && !quizCompleted && !answerResult) {
          const { question, total, answered } = await fetchCurrentQuestion(updatedRoom.id, participant.id)
          setTotalQuestions(total)
          setAnsweredCount(answered)

          if (question) {
            setCurrentQuestion(question)
            setSelectedAnswer(null)
            setTimeLeft(question.time_limit)
            setQuestionStartTime(Date.now())
          } else if (answered >= total && total > 0) {
            setQuizCompleted(true)
          }
        }
      }
    }, 3000) // 3초마다 폴링

    return () => clearInterval(pollInterval)
  }, [participant, room, currentQuestion, quizCompleted, answerResult, fetchRoomInfo, fetchCurrentQuestion])

  // 타이머
  useEffect(() => {
    if (!currentQuestion || timeLeft <= 0 || answerResult) return

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          // 시간 초과시 자동 제출 (선택하지 않았으면 빈 답)
          if (!answerResult && selectedAnswer === null) {
            toast.error('시간이 초과되었습니다!')
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [currentQuestion, timeLeft, answerResult, selectedAnswer])

  const handleSubmitAnswer = async (answer: string) => {
    if (!participant || !currentQuestion || answering || answerResult) return

    setSelectedAnswer(answer)
    setAnswering(true)

    const answerTime = Date.now() - questionStartTime

    try {
      const response = await apiFetch('/api/games/quiz/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: currentQuestion.id,
          participant_id: participant.id,
          selected_answer: answer,
          answer_time_ms: answerTime,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || '답변 제출에 실패했습니다.')
        setSelectedAnswer(null)
        return
      }

      setAnswerResult(data.answer)
      setTotalScore((prev) => prev + data.answer.points_earned)

      // 로컬 스토리지 업데이트
      const stored = localStorage.getItem('participant')
      if (stored) {
        const storedData = JSON.parse(stored)
        storedData.score = totalScore + data.answer.points_earned
        localStorage.setItem('participant', JSON.stringify(storedData))
      }

      if (data.answer.is_correct) {
        toast.success(`정답! +${data.answer.points_earned}점`)
      } else {
        toast.error(`오답! 정답: ${data.answer.correct_answer}`)
      }

      // 3초 후 다음 문제로 자동 진행
      setTimeout(async () => {
        if (!room) return

        const newAnsweredCount = answeredCount + 1
        setAnsweredCount(newAnsweredCount)

        // 마지막 문제인지 확인
        if (newAnsweredCount >= totalQuestions) {
          setQuizCompleted(true)
          setCurrentQuestion(null)
          setAnswerResult(null)
        } else {
          // 다음 문제 로드
          const { question } = await fetchCurrentQuestion(room.id, participant.id)
          if (question) {
            setCurrentQuestion(question)
            setSelectedAnswer(null)
            setAnswerResult(null)
            setTimeLeft(question.time_limit)
            setQuestionStartTime(Date.now())
          }
        }
      }, 2000)
    } catch {
      toast.error('오류가 발생했습니다.')
      setSelectedAnswer(null)
    } finally {
      setAnswering(false)
    }
  }

  const handleLeave = () => {
    localStorage.removeItem('participant')
    toast.success('게임에서 나왔습니다.')
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-base">로딩 중...</div>
      </div>
    )
  }

  if (!participant || !room) {
    return null
  }

  const isQuizGame = room.game_type === 'quiz'

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-100 dark:from-gray-900 dark:to-gray-800">
      {/* 상단 헤더 */}
      <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b sticky top-0 z-10">
        <div className="container mx-auto px-3 py-2 flex justify-between items-center max-w-lg">
          <div>
            <h1 className="text-base font-bold">{room.room_name}</h1>
            <p className="text-xs text-muted-foreground">
              {GAME_TYPES[room.game_type] || room.game_type}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isQuizGame && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">점수</p>
                <p className="font-bold text-base text-primary">{totalScore}점</p>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="container mx-auto px-3 py-3 max-w-lg">
        {/* 참가자 정보 */}
        <Card className="mb-3">
          <CardContent className="py-2 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-base">
                  😊
                </div>
                <span className="font-medium text-sm">{participant.nickname}</span>
              </div>
              <span className="font-mono text-sm font-bold">{room.room_code}</span>
            </div>
          </CardContent>
        </Card>

        {/* 게임 상태별 UI */}
        {room.status === 'waiting' && (
          <Card className="text-center py-8">
            <CardContent>
              <div className="text-4xl mb-2">⏳</div>
              <h2 className="text-lg font-bold mb-1">게임 대기 중</h2>
              <p className="text-sm text-muted-foreground mb-3">
                강사가 게임을 시작하면 시작됩니다
              </p>
              <p className="text-xs text-muted-foreground">
                {room.participant_count}명 참여 중
              </p>
            </CardContent>
          </Card>
        )}

        {room.status === 'in_progress' && isQuizGame && currentQuestion && (
          <Card className="overflow-hidden">
            {/* 타이머 바 */}
            <div className="h-1.5 bg-gray-200">
              <div
                className={`h-full transition-all duration-1000 ${
                  timeLeft > 10 ? 'bg-green-500' :
                  timeLeft > 5 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${(timeLeft / currentQuestion.time_limit) * 100}%` }}
              />
            </div>

            <CardHeader className="pb-2 pt-3">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">
                    문제 {currentQuestion.order_num} / {totalQuestions}
                  </p>
                  <CardTitle className="text-base">{currentQuestion.question_text}</CardTitle>
                </div>
                <div className="text-right ml-2">
                  <p className={`text-2xl font-bold ${
                    timeLeft > 10 ? 'text-green-600' :
                    timeLeft > 5 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {timeLeft}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="px-3 pb-3">
              <div className={`grid gap-2 ${
                currentQuestion.question_type === 'ox' ? 'grid-cols-2' : 'grid-cols-1'
              }`}>
                {currentQuestion.options.map((option, idx) => {
                  const isSelected = selectedAnswer === option
                  const isCorrectAnswer = answerResult?.correct_answer === option
                  const isWrongSelected = answerResult && isSelected && !answerResult.is_correct

                  let buttonStyle = 'bg-white hover:bg-gray-50 border-2 border-gray-200'
                  if (answerResult) {
                    if (isCorrectAnswer) {
                      buttonStyle = 'bg-green-100 border-2 border-green-500 text-green-700'
                    } else if (isWrongSelected) {
                      buttonStyle = 'bg-red-100 border-2 border-red-500 text-red-700'
                    } else {
                      buttonStyle = 'bg-gray-100 border-2 border-gray-200 text-gray-400'
                    }
                  } else if (isSelected) {
                    buttonStyle = 'bg-primary/10 border-2 border-primary'
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => handleSubmitAnswer(option)}
                      disabled={!!answerResult || answering || timeLeft === 0}
                      className={`p-3 rounded-lg text-left transition-all ${buttonStyle} ${
                        currentQuestion.question_type === 'ox' ? 'text-center' : ''
                      } ${!answerResult && !answering && timeLeft > 0 ? 'active:scale-95' : ''}`}
                    >
                      {currentQuestion.question_type === 'ox' ? (
                        <span className={`text-3xl font-bold ${
                          option === 'O' ? 'text-blue-600' : 'text-red-600'
                        }`}>
                          {option}
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold shrink-0">
                            {idx + 1}
                          </span>
                          <span className="flex-1 text-sm">{option}</span>
                          {answerResult && isCorrectAnswer && (
                            <span className="text-green-600">✓</span>
                          )}
                          {isWrongSelected && (
                            <span className="text-red-600">✗</span>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* 결과 표시 */}
              {answerResult && (
                <div className={`mt-3 p-3 rounded-lg text-center ${
                  answerResult.is_correct
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-red-50 border border-red-200'
                }`}>
                  <p className={`text-base font-bold ${
                    answerResult.is_correct ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {answerResult.is_correct ? `정답! +${answerResult.points_earned}점` : '오답'}
                  </p>
                  {!answerResult.is_correct && (
                    <p className="text-xs text-muted-foreground mt-1">
                      정답: {answerResult.correct_answer}
                    </p>
                  )}
                </div>
              )}

              {/* 시간 초과 */}
              {timeLeft === 0 && !answerResult && (
                <div className="mt-3 p-3 rounded-lg text-center bg-gray-50 border border-gray-200">
                  <p className="text-base font-bold text-gray-600">시간 초과</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {room.status === 'in_progress' && isQuizGame && !currentQuestion && quizCompleted && (
          <Card className="text-center py-8">
            <CardContent>
              <div className="text-4xl mb-2">🎉</div>
              <h2 className="text-lg font-bold mb-1">모든 문제 완료!</h2>
              <p className="text-sm text-muted-foreground mb-3">
                게임 종료까지 기다려주세요
              </p>
              <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg">
                <p className="text-xs text-muted-foreground">현재 점수</p>
                <p className="text-3xl font-bold text-primary">{totalScore}점</p>
              </div>
            </CardContent>
          </Card>
        )}

        {room.status === 'in_progress' && isQuizGame && !currentQuestion && !quizCompleted && (
          <Card className="text-center py-8">
            <CardContent>
              <div className="text-4xl mb-2">🎮</div>
              <h2 className="text-lg font-bold mb-1">게임 진행 중</h2>
              <p className="text-sm text-muted-foreground">
                문제를 불러오는 중...
              </p>
            </CardContent>
          </Card>
        )}

        {room.status === 'in_progress' && !isQuizGame && (
          <Card className="text-center py-8">
            <CardContent>
              <div className="text-4xl mb-2">🎮</div>
              <h2 className="text-lg font-bold mb-1">게임 진행 중</h2>
              <p className="text-sm text-muted-foreground">
                {GAME_TYPES[room.game_type] || room.game_type}
              </p>
            </CardContent>
          </Card>
        )}

        {room.status === 'finished' && (
          <Card className="text-center py-8">
            <CardContent>
              <div className="text-4xl mb-2">🏆</div>
              <h2 className="text-lg font-bold mb-1">게임 종료</h2>
              {isQuizGame && (
                <div className="mb-4 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg">
                  <p className="text-xs text-muted-foreground">최종 점수</p>
                  <p className="text-3xl font-bold text-primary">{totalScore}점</p>
                </div>
              )}
              <Link href="/">
                <Button>메인으로</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
