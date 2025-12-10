'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'

interface GameRoom {
  id: string
  room_code: string
  room_name: string
  game_type: string
  max_participants: number
  status: 'waiting' | 'in_progress' | 'finished'
  participant_count: number
  current_question_index: number | null
  created_at: string
  started_at: string | null
  ended_at: string | null
}

interface Participant {
  id: string
  nickname: string
  score: number
  is_active: boolean
  joined_at: string
}

interface QuizQuestion {
  id: string
  question_text: string
  question_type: 'multiple_choice' | 'ox'
  options: string[]
  correct_answer: string
  time_limit: number
  points: number
  order_num: number
}

const GAME_TYPES: Record<string, string> = {
  quiz: '퀴즈 게임',
  drawing: '그림 그리기',
  word_chain: '단어 연상',
  speed_quiz: '스피드 퀴즈',
  voting: '투표 게임',
}

export default function RoomManagePage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const [room, setRoom] = useState<GameRoom | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // 퀴즈 추가 모달 상태
  const [showQuizModal, setShowQuizModal] = useState(false)
  const [quizForm, setQuizForm] = useState({
    question_text: '',
    question_type: 'multiple_choice' as 'multiple_choice' | 'ox',
    options: ['', '', '', ''],
    correct_answer: '',
    time_limit: 30,
    points: 100,
  })
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null)

  useEffect(() => {
    fetchRoom()
    fetchParticipants()

    // 5초마다 참가자 목록 새로고침
    const interval = setInterval(() => {
      fetchParticipants()
      if (room?.game_type === 'quiz') {
        fetchQuestions()
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [id])

  useEffect(() => {
    if (room?.game_type === 'quiz') {
      fetchQuestions()
    }
  }, [room?.game_type])

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

  const fetchParticipants = async () => {
    try {
      const response = await fetch(`/api/games/rooms/${id}/participants`)
      if (response.ok) {
        const data = await response.json()
        setParticipants(data.participants || [])
      }
    } catch (error) {
      console.error('Failed to fetch participants:', error)
    }
  }

  const fetchQuestions = async () => {
    try {
      const response = await fetch(`/api/games/quiz?room_id=${id}`)
      if (response.ok) {
        const data = await response.json()
        setQuestions(data.questions || [])
      }
    } catch (error) {
      console.error('Failed to fetch questions:', error)
    }
  }

  const handleStatusChange = async (newStatus: 'waiting' | 'in_progress' | 'finished') => {
    // 퀴즈 게임인 경우 퀴즈 상태 API 사용
    if (room?.game_type === 'quiz') {
      if (newStatus === 'in_progress') {
        await handleQuizStart()
      } else if (newStatus === 'finished') {
        await handleQuizEnd()
      } else {
        // 대기 상태로 변경
        await handleRoomStatusChange(newStatus)
      }
      return
    }

    await handleRoomStatusChange(newStatus)
  }

  const handleRoomStatusChange = async (newStatus: 'waiting' | 'in_progress' | 'finished') => {
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

  const handleQuizStart = async () => {
    if (questions.length === 0) {
      toast.error('퀴즈 문제를 먼저 추가해주세요.')
      return
    }

    setActionLoading(true)
    try {
      const response = await fetch('/api/games/quiz/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: id, action: 'start' }),
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || '게임 시작에 실패했습니다.')
        return
      }

      toast.success('퀴즈 게임이 시작되었습니다!')
      await fetchRoom()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleQuizEnd = async () => {
    setActionLoading(true)
    try {
      const response = await fetch('/api/games/quiz/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: id, action: 'end' }),
      })

      if (!response.ok) {
        toast.error('게임 종료에 실패했습니다.')
        return
      }

      toast.success('퀴즈 게임이 종료되었습니다.')
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

  // 퀴즈 추가/수정
  const handleQuizSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!quizForm.question_text.trim()) {
      toast.error('문제를 입력해주세요.')
      return
    }

    if (!quizForm.correct_answer.trim()) {
      toast.error('정답을 선택해주세요.')
      return
    }

    if (quizForm.question_type === 'multiple_choice') {
      const validOptions = quizForm.options.filter(opt => opt.trim())
      if (validOptions.length < 2) {
        toast.error('최소 2개의 선택지를 입력해주세요.')
        return
      }
      if (!validOptions.includes(quizForm.correct_answer)) {
        toast.error('정답이 선택지에 포함되어야 합니다.')
        return
      }
    }

    setActionLoading(true)
    try {
      const payload = {
        ...quizForm,
        room_id: id,
        options: quizForm.question_type === 'ox'
          ? ['O', 'X']
          : quizForm.options.filter(opt => opt.trim()),
      }

      let response
      if (editingQuestionId) {
        response = await fetch(`/api/games/quiz/${editingQuestionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        response = await fetch('/api/games/quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || '저장에 실패했습니다.')
        return
      }

      toast.success(editingQuestionId ? '문제가 수정되었습니다.' : '문제가 추가되었습니다.')
      setShowQuizModal(false)
      resetQuizForm()
      await fetchQuestions()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  const resetQuizForm = () => {
    setQuizForm({
      question_text: '',
      question_type: 'multiple_choice',
      options: ['', '', '', ''],
      correct_answer: '',
      time_limit: 30,
      points: 100,
    })
    setEditingQuestionId(null)
  }

  const handleEditQuestion = (question: QuizQuestion) => {
    setQuizForm({
      question_text: question.question_text,
      question_type: question.question_type,
      options: question.question_type === 'ox'
        ? ['', '', '', '']
        : [...question.options, '', '', '', ''].slice(0, 4),
      correct_answer: question.correct_answer,
      time_limit: question.time_limit,
      points: question.points,
    })
    setEditingQuestionId(question.id)
    setShowQuizModal(true)
  }

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('이 문제를 삭제하시겠습니까?')) return

    try {
      const response = await fetch(`/api/games/quiz/${questionId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        toast.error('삭제에 실패했습니다.')
        return
      }

      toast.success('문제가 삭제되었습니다.')
      await fetchQuestions()
    } catch {
      toast.error('오류가 발생했습니다.')
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

  const activeParticipants = participants.filter(p => p.is_active)
  const isQuizGame = room.game_type === 'quiz'
  const currentQuestion = room.current_question_index
    ? questions.find(q => q.order_num === room.current_question_index)
    : null

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
            {isQuizGame && room.status === 'in_progress' && room.current_question_index && (
              <span className="ml-2">
                - 문제 {room.current_question_index} / {questions.length}
              </span>
            )}
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
                <span>{activeParticipants.length}명</span>
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
                  disabled={actionLoading || (isQuizGame && questions.length === 0)}
                >
                  {isQuizGame ? '퀴즈 시작하기' : '게임 시작하기'}
                </Button>
              )}
              {room.status === 'in_progress' && (
                <>
                  {isQuizGame && (
                    <div className="p-4 bg-blue-50 rounded-lg text-center">
                      <p className="text-sm text-blue-700">
                        모든 참가자가 답변하면 자동으로 다음 문제로 넘어갑니다
                      </p>
                    </div>
                  )}
                  <Button
                    className="w-full"
                    size="lg"
                    variant="destructive"
                    onClick={() => handleStatusChange('finished')}
                    disabled={actionLoading}
                  >
                    게임 종료하기
                  </Button>
                </>
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
              {isQuizGame && questions.length === 0 && room.status === 'waiting' && (
                <p className="text-sm text-amber-600 text-center">
                  퀴즈 문제를 먼저 추가해주세요
                </p>
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

          {/* 퀴즈 게임: 현재 문제 표시 */}
          {isQuizGame && room.status === 'in_progress' && currentQuestion && (
            <Card className="md:col-span-2 border-2 border-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-2xl">📝</span>
                  현재 문제 #{currentQuestion.order_num}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-medium mb-4">{currentQuestion.question_text}</div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {currentQuestion.options.map((option, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border-2 ${
                        option === currentQuestion.correct_answer
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200'
                      }`}
                    >
                      <span className="font-bold mr-2">{idx + 1}.</span>
                      {option}
                      {option === currentQuestion.correct_answer && (
                        <span className="ml-2 text-green-600">✓ 정답</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>제한시간: {currentQuestion.time_limit}초</span>
                  <span>배점: {currentQuestion.points}점</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 퀴즈 문제 목록 (대기/종료 상태) */}
          {isQuizGame && room.status !== 'in_progress' && (
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>퀴즈 문제 목록</CardTitle>
                    <CardDescription>총 {questions.length}개의 문제</CardDescription>
                  </div>
                  {room.status === 'waiting' && (
                    <Button onClick={() => { resetQuizForm(); setShowQuizModal(true); }}>
                      + 문제 추가
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {questions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>퀴즈 문제가 없습니다.</p>
                    {room.status === 'waiting' && (
                      <Button
                        className="mt-4"
                        variant="outline"
                        onClick={() => { resetQuizForm(); setShowQuizModal(true); }}
                      >
                        첫 번째 문제 추가하기
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {questions.map((question) => (
                      <div
                        key={question.id}
                        className="p-4 border rounded-lg flex justify-between items-start"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-muted-foreground">
                              #{question.order_num}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              question.question_type === 'ox'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-purple-100 text-purple-700'
                            }`}>
                              {question.question_type === 'ox' ? 'O/X' : '객관식'}
                            </span>
                          </div>
                          <p className="font-medium">{question.question_text}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            정답: {question.correct_answer} | {question.time_limit}초 | {question.points}점
                          </p>
                        </div>
                        {room.status === 'waiting' && (
                          <div className="flex gap-2 ml-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditQuestion(question)}
                            >
                              수정
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleDeleteQuestion(question.id)}
                            >
                              삭제
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 참가자 목록 */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>참가자 목록</CardTitle>
                  <CardDescription>현재 방에 참여 중인 학생들</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchParticipants}>
                  새로고침
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {activeParticipants.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>아직 참가자가 없습니다.</p>
                  <p className="text-sm mt-2">
                    학생들에게 방 코드 <span className="font-mono font-bold">{room.room_code}</span>를 공유하세요!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {activeParticipants
                    .sort((a, b) => b.score - a.score)
                    .map((participant, index) => (
                    <div
                      key={participant.id}
                      className="flex flex-col items-center p-3 bg-muted rounded-lg"
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg mb-2 ${
                        index === 0 ? 'bg-yellow-400 text-yellow-900' :
                        index === 1 ? 'bg-gray-300 text-gray-700' :
                        index === 2 ? 'bg-amber-600 text-amber-100' :
                        'bg-primary/10'
                      }`}>
                        {index < 3 ? ['🥇', '🥈', '🥉'][index] : index + 1}
                      </div>
                      <p className="text-sm font-medium text-center truncate w-full">
                        {participant.nickname}
                      </p>
                      {room.status !== 'waiting' && (
                        <p className="text-xs text-muted-foreground">
                          {participant.score}점
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* 퀴즈 추가/수정 모달 */}
      {showQuizModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {editingQuestionId ? '문제 수정' : '새 문제 추가'}
              </h2>
              <form onSubmit={handleQuizSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">문제 유형</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="question_type"
                        value="multiple_choice"
                        checked={quizForm.question_type === 'multiple_choice'}
                        onChange={(e) => setQuizForm({
                          ...quizForm,
                          question_type: e.target.value as 'multiple_choice' | 'ox',
                          correct_answer: ''
                        })}
                      />
                      <span>객관식</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="question_type"
                        value="ox"
                        checked={quizForm.question_type === 'ox'}
                        onChange={(e) => setQuizForm({
                          ...quizForm,
                          question_type: e.target.value as 'multiple_choice' | 'ox',
                          correct_answer: ''
                        })}
                      />
                      <span>O/X</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">문제</label>
                  <textarea
                    className="w-full px-3 py-2 border rounded-lg resize-none"
                    rows={3}
                    value={quizForm.question_text}
                    onChange={(e) => setQuizForm({ ...quizForm, question_text: e.target.value })}
                    placeholder="문제를 입력하세요"
                  />
                </div>

                {quizForm.question_type === 'multiple_choice' ? (
                  <div>
                    <label className="block text-sm font-medium mb-2">선택지</label>
                    <div className="space-y-2">
                      {quizForm.options.map((option, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="correct_answer"
                            checked={quizForm.correct_answer === option && option.trim() !== ''}
                            onChange={() => setQuizForm({ ...quizForm, correct_answer: option })}
                            disabled={!option.trim()}
                          />
                          <Input
                            value={option}
                            onChange={(e) => {
                              const newOptions = [...quizForm.options]
                              newOptions[idx] = e.target.value
                              setQuizForm({ ...quizForm, options: newOptions })
                            }}
                            placeholder={`선택지 ${idx + 1}`}
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      정답으로 설정할 선택지 앞의 라디오 버튼을 선택하세요
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-2">정답</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 px-6 py-3 border rounded-lg cursor-pointer hover:bg-muted">
                        <input
                          type="radio"
                          name="ox_answer"
                          value="O"
                          checked={quizForm.correct_answer === 'O'}
                          onChange={(e) => setQuizForm({ ...quizForm, correct_answer: e.target.value })}
                        />
                        <span className="text-2xl font-bold text-blue-600">O</span>
                      </label>
                      <label className="flex items-center gap-2 px-6 py-3 border rounded-lg cursor-pointer hover:bg-muted">
                        <input
                          type="radio"
                          name="ox_answer"
                          value="X"
                          checked={quizForm.correct_answer === 'X'}
                          onChange={(e) => setQuizForm({ ...quizForm, correct_answer: e.target.value })}
                        />
                        <span className="text-2xl font-bold text-red-600">X</span>
                      </label>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">제한 시간 (초)</label>
                    <Input
                      type="number"
                      min={5}
                      max={120}
                      value={quizForm.time_limit}
                      onChange={(e) => setQuizForm({ ...quizForm, time_limit: parseInt(e.target.value) || 30 })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">배점</label>
                    <Input
                      type="number"
                      min={10}
                      max={1000}
                      step={10}
                      value={quizForm.points}
                      onChange={(e) => setQuizForm({ ...quizForm, points: parseInt(e.target.value) || 100 })}
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setShowQuizModal(false); resetQuizForm(); }}
                  >
                    취소
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={actionLoading}
                  >
                    {actionLoading ? '저장 중...' : editingQuestionId ? '수정' : '추가'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
