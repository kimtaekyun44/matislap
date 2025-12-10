'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
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
  current_question_index: number | null
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
  word_chain: '단어 연상',
  speed_quiz: '스피드 퀴즈',
  voting: '투표 게임',
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
  const [lastQuestionIndex, setLastQuestionIndex] = useState<number | null>(null)
  const [totalQuestions, setTotalQuestions] = useState<number>(0)
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

  const fetchCurrentQuestion = useCallback(async (roomId: string) => {
    try {
      const response = await fetch(`/api/games/quiz/status?room_id=${roomId}`)
      if (!response.ok) return { question: null, total: 0 }

      const data = await response.json()
      return {
        question: data.current_question as QuizQuestion | null,
        total: data.total_questions as number
      }
    } catch {
      return { question: null, total: 0 }
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

      setLoading(false)

      if (roomData?.game_type === 'quiz' && roomData.status === 'in_progress') {
        const { question, total } = await fetchCurrentQuestion(roomData.id)
        setTotalQuestions(total)
        if (question) {
          setCurrentQuestion(question)
          setTimeLeft(question.time_limit)
          setQuestionStartTime(Date.now())
        }
      }
    }

    init()
  }, [code, router, fetchRoomInfo, fetchCurrentQuestion])

  // 3초마다 방 상태 및 퀴즈 폴링
  useEffect(() => {
    if (!participant || !room) return

    const pollInterval = setInterval(async () => {
      const updatedRoom = await fetchRoomInfo()

      if (updatedRoom?.game_type === 'quiz' && updatedRoom.status === 'in_progress') {
        // 문제 인덱스가 변경되었는지 확인
        if (updatedRoom.current_question_index !== lastQuestionIndex) {
          const { question, total } = await fetchCurrentQuestion(updatedRoom.id)
          setTotalQuestions(total)

          if (question && question.order_num !== currentQuestion?.order_num) {
            // 새 문제로 변경
            setCurrentQuestion(question)
            setSelectedAnswer(null)
            setAnswerResult(null)
            setTimeLeft(question.time_limit)
            setQuestionStartTime(Date.now())
            setLastQuestionIndex(updatedRoom.current_question_index)
            setQuizCompleted(false)
          } else if (!question && answerResult) {
            // 문제가 없고 답변 결과가 있으면 = 마지막 문제 완료
            setQuizCompleted(true)
            setCurrentQuestion(null)
          }
        }
      } else if (updatedRoom?.status === 'finished') {
        // 게임 종료
        setCurrentQuestion(null)
        setQuizCompleted(false)
      }
    }, 3000) // 3초마다 폴링

    return () => clearInterval(pollInterval)
  }, [participant, room, currentQuestion, lastQuestionIndex, answerResult, fetchRoomInfo, fetchCurrentQuestion])

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
      const response = await fetch('/api/games/quiz/answer', {
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

      // 마지막 문제인지 확인
      if (currentQuestion.order_num >= totalQuestions) {
        // 3초 후 완료 화면으로 전환
        setTimeout(() => {
          setQuizCompleted(true)
          setCurrentQuestion(null)
        }, 3000)
      }
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
        <div className="text-lg">로딩 중...</div>
      </div>
    )
  }

  if (!participant || !room) {
    return null
  }

  const isQuizGame = room.game_type === 'quiz'

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="container mx-auto max-w-2xl">
        {/* 상단 정보 */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-xl font-bold">{room.room_name}</h1>
            <p className="text-sm text-muted-foreground">
              {GAME_TYPES[room.game_type] || room.game_type}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isQuizGame && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">내 점수</p>
                <p className="font-bold text-lg text-primary">{totalScore}점</p>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleLeave}>
              나가기
            </Button>
          </div>
        </div>

        {/* 참가자 정보 */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-xl">
                  😊
                </div>
                <div>
                  <p className="font-medium">{participant.nickname}</p>
                  <p className="text-sm text-muted-foreground">참가자</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">방 코드</p>
                <p className="font-mono font-bold">{room.room_code}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 게임 상태별 UI */}
        {room.status === 'waiting' && (
          <Card>
            <CardHeader className="text-center">
              <div className="text-6xl mb-4">⏳</div>
              <CardTitle>게임 대기 중</CardTitle>
              <CardDescription>
                강사가 게임을 시작하면 자동으로 시작됩니다
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground mb-4">
                현재 {room.participant_count}명 참여 중
              </p>
              <div className="animate-pulse">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
                  <span className="w-2 h-2 bg-yellow-500 rounded-full animate-bounce"></span>
                  <span className="text-sm">대기 중...</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {room.status === 'in_progress' && isQuizGame && currentQuestion && (
          <Card className="overflow-hidden">
            {/* 타이머 바 */}
            <div className="h-2 bg-gray-200">
              <div
                className={`h-full transition-all duration-1000 ${
                  timeLeft > 10 ? 'bg-green-500' :
                  timeLeft > 5 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${(timeLeft / currentQuestion.time_limit) * 100}%` }}
              />
            </div>

            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    문제 #{currentQuestion.order_num}
                  </p>
                  <CardTitle className="text-xl">{currentQuestion.question_text}</CardTitle>
                </div>
                <div className="text-right">
                  <p className={`text-3xl font-bold ${
                    timeLeft > 10 ? 'text-green-600' :
                    timeLeft > 5 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {timeLeft}
                  </p>
                  <p className="text-xs text-muted-foreground">초</p>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className={`grid gap-3 ${
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
                      className={`p-4 rounded-lg text-left transition-all ${buttonStyle} ${
                        currentQuestion.question_type === 'ox' ? 'text-center' : ''
                      } ${!answerResult && !answering && timeLeft > 0 ? 'hover:scale-[1.02]' : ''}`}
                    >
                      {currentQuestion.question_type === 'ox' ? (
                        <span className={`text-4xl font-bold ${
                          option === 'O' ? 'text-blue-600' : 'text-red-600'
                        }`}>
                          {option}
                        </span>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold">
                            {idx + 1}
                          </span>
                          <span className="flex-1">{option}</span>
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
                <div className={`mt-4 p-4 rounded-lg text-center ${
                  answerResult.is_correct
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-red-50 border border-red-200'
                }`}>
                  <p className={`text-xl font-bold ${
                    answerResult.is_correct ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {answerResult.is_correct ? '정답입니다!' : '오답입니다'}
                  </p>
                  {answerResult.is_correct && (
                    <p className="text-green-600 mt-1">+{answerResult.points_earned}점</p>
                  )}
                  {!answerResult.is_correct && (
                    <p className="text-muted-foreground mt-1">
                      정답: {answerResult.correct_answer}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground mt-2">
                    다음 문제를 기다려주세요...
                  </p>
                </div>
              )}

              {/* 시간 초과 */}
              {timeLeft === 0 && !answerResult && (
                <div className="mt-4 p-4 rounded-lg text-center bg-gray-50 border border-gray-200">
                  <p className="text-xl font-bold text-gray-600">시간 초과!</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    다음 문제를 기다려주세요...
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {room.status === 'in_progress' && isQuizGame && !currentQuestion && quizCompleted && (
          <Card>
            <CardHeader className="text-center">
              <div className="text-6xl mb-4">🎉</div>
              <CardTitle>모든 문제를 마쳤습니다!</CardTitle>
              <CardDescription>
                수고하셨습니다. 강사가 게임을 종료할 때까지 기다려주세요.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <div className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg">
                <p className="text-sm text-muted-foreground">현재 점수</p>
                <p className="text-4xl font-bold text-primary">{totalScore}점</p>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                총 {totalQuestions}문제 완료
              </p>
            </CardContent>
          </Card>
        )}

        {room.status === 'in_progress' && isQuizGame && !currentQuestion && !quizCompleted && (
          <Card>
            <CardHeader className="text-center">
              <div className="text-6xl mb-4">🎮</div>
              <CardTitle>게임 진행 중</CardTitle>
              <CardDescription>
                문제를 불러오는 중입니다...
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <div className="animate-pulse">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></span>
                  <span className="text-sm">로딩 중...</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {room.status === 'in_progress' && !isQuizGame && (
          <Card>
            <CardHeader className="text-center">
              <div className="text-6xl mb-4">🎮</div>
              <CardTitle>게임 진행 중</CardTitle>
              <CardDescription>
                게임이 진행되고 있습니다
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <div className="p-6 bg-muted rounded-lg">
                <p className="text-lg font-medium">게임 컨텐츠가 여기에 표시됩니다</p>
                <p className="text-sm text-muted-foreground mt-2">
                  ({GAME_TYPES[room.game_type] || room.game_type} 기능 구현 예정)
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {room.status === 'finished' && (
          <Card>
            <CardHeader className="text-center">
              <div className="text-6xl mb-4">🏆</div>
              <CardTitle>게임 종료</CardTitle>
              <CardDescription>
                수고하셨습니다!
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              {isQuizGame && (
                <div className="mb-6 p-6 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg">
                  <p className="text-sm text-muted-foreground">최종 점수</p>
                  <p className="text-4xl font-bold text-primary">{totalScore}점</p>
                </div>
              )}
              <Link href="/">
                <Button size="lg">메인으로 돌아가기</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
