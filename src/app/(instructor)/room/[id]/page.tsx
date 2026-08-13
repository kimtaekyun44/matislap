'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'
import { apiFetch } from '@/lib/utils/api'
import JeopardyUpload from '@/components/jeopardy/JeopardyUpload'

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

interface QuizProgress {
  completed_participants: number
  total_participants: number
  total_questions: number
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

interface QuizHistoryEntry {
  id: string
  question_id: string
  action: 'create' | 'update' | 'delete'
  instructor_name: string | null
  room_status: string | null
  order_num: number | null
  changed_fields: Record<string, { before: unknown; after: unknown }>
  snapshot: Record<string, unknown> | null
  created_at: string
}

interface DrawingWord {
  id: string
  word: string
  hint: string | null
  order_num: number
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

interface SurveyQuestion {
  id: string
  question_text: string
  question_type: 'short_answer' | 'choice_2' | 'choice_4'
  options: string[] | null
  order_num: number
}

interface SurveyResultRow {
  participant_id: string
  nickname: string
  answers: Record<string, string>
}

interface LadderGameState {
  ladder_data: {
    lines_count: number
    horizontal_lines: { row: number; fromCol: number }[]
  } | null
  selections: LadderSelection[]
  items: LadderItem[]
}

interface JeopardyQuestion {
  id: string
  category: string
  points: number
  question_type: 'short_answer' | '2지선다' | '4지선다'
  content: string
  options: string[]
  answer: string
  is_used: boolean
}

const GAME_TYPES: Record<string, string> = {
  quiz: '퀴즈 게임',
  drawing: '그림 그리기',
  ladder: '사다리 게임',
  survey: '설문조사',
  jeopardy: '제퍼디쇼',
}

const QUIZ_HISTORY_ACTIONS: Record<string, string> = {
  create: '생성',
  update: '수정',
  delete: '삭제',
}

const QUIZ_FIELD_LABELS: Record<string, string> = {
  question_text: '문제',
  question_type: '유형',
  options: '선택지',
  correct_answer: '정답',
  time_limit: '제한시간',
  points: '배점',
  order_num: '순서',
}

const QUIZ_QUESTION_TYPES: Record<string, string> = {
  multiple_choice: '객관식',
  ox: 'O/X',
}

// 선택지 → 정답 순으로 읽어야 "몇 번이 정답인지"가 자연스럽게 이어진다
const QUIZ_FIELD_ORDER = [
  'question_text',
  'question_type',
  'options',
  'correct_answer',
  'time_limit',
  'points',
  'order_num',
]

// 이력에 저장된 값(문자열/숫자/배열)을 한 줄로 보여주기 위한 변환
const formatHistoryValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '(없음)'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  if (value === 'multiple_choice' || value === 'ox') {
    return QUIZ_QUESTION_TYPES[value]
  }
  return String(value)
}

/**
 * 이력 항목에서 변경 전/후의 선택지와 문제 유형을 복원한다.
 * 값이 바뀌지 않은 필드는 changed_fields에 없으므로, 그 경우 snapshot(변경 후 전체 값)을
 * 전/후 양쪽에 그대로 쓴다. 정답 번호를 매기려면 해당 시점의 선택지 배열이 반드시 필요하다.
 */
const resolveHistoryContext = (entry: QuizHistoryEntry) => {
  const pick = (field: 'options' | 'question_type') => {
    const change = entry.changed_fields[field]
    if (change) return { before: change.before, after: change.after }
    const current = entry.snapshot?.[field] ?? null
    return { before: current, after: current }
  }

  return { options: pick('options'), questionType: pick('question_type') }
}

// 정해진 순서대로 정렬하되, 목록에 없는 필드가 생겨도 누락되지 않게 뒤에 붙인다
const orderChangedFields = (changedFields: Record<string, unknown>) => [
  ...QUIZ_FIELD_ORDER.filter((field) => changedFields[field]),
  ...Object.keys(changedFields).filter(
    (field) => !QUIZ_FIELD_ORDER.includes(field)
  ),
]

// 정답 텍스트가 선택지 중 몇 번인지 찾는다 (일치하는 선택지가 없으면 null)
const findOptionNumber = (options: unknown, answer: unknown): number | null => {
  if (!Array.isArray(options)) return null
  const index = options.findIndex((option) => String(option) === String(answer))
  return index >= 0 ? index + 1 : null
}

/**
 * 선택지를 번호 기준으로 짝지어 비교한다.
 * 선택지 개수가 바뀐 경우(2지 → 4지 등)를 위해 긴 쪽 길이를 기준으로 맞춘다.
 */
const buildOptionRows = (before: unknown, after: unknown) => {
  const beforeList = Array.isArray(before) ? before : []
  const afterList = Array.isArray(after) ? after : []
  const length = Math.max(beforeList.length, afterList.length)

  return Array.from({ length }, (_, index) => {
    const prev = beforeList[index] ?? null
    const next = afterList[index] ?? null
    return {
      number: index + 1,
      before: prev,
      after: next,
      changed: JSON.stringify(prev) !== JSON.stringify(next),
    }
  })
}

export default function RoomManagePage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const [room, setRoom] = useState<GameRoom | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [drawingWords, setDrawingWords] = useState<DrawingWord[]>([])
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

  // 퀴즈 변경 이력 모달 상태
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<QuizHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  // null이면 방 전체 이력, 값이 있으면 해당 문제만
  const [historyQuestionId, setHistoryQuestionId] = useState<string | null>(null)

  // 그림 그리기 추가 모달 상태
  const [showDrawingModal, setShowDrawingModal] = useState(false)
  const [drawingForm, setDrawingForm] = useState({
    word: '',
    hint: '',
  })
  const [editingWordId, setEditingWordId] = useState<string | null>(null)

  // 그림 그리기 게임 진행 상태
  const [currentDrawingRound, setCurrentDrawingRound] = useState<{
    round_num: number
    drawer_nickname: string
    current_word: string
    drawing_data: string | null
  } | null>(null)

  // 그리는 사람 선택
  const [selectedDrawerId, setSelectedDrawerId] = useState<string>('')

  // 사다리 게임 상태
  const [ladderItems, setLadderItems] = useState<LadderItem[]>([])
  const [ladderGame, setLadderGame] = useState<LadderGameState | null>(null)
  const [showLadderModal, setShowLadderModal] = useState(false)
  const [ladderForm, setLadderForm] = useState({ item_text: '' })
  const [editingItemId, setEditingItemId] = useState<string | null>(null)

  // 퀴즈 진행 상태 (개인별 진행 방식)
  const [quizProgress, setQuizProgress] = useState<QuizProgress | null>(null)

  // 설문조사 상태
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[]>([])
  const [showSurveyModal, setShowSurveyModal] = useState(false)
  const [surveyForm, setSurveyForm] = useState({
    question_text: '',
    question_type: 'short_answer' as 'short_answer' | 'choice_2' | 'choice_4',
    options: ['', ''],
  })
  const [editingSurveyId, setEditingSurveyId] = useState<string | null>(null)
  const [surveyProgress, setSurveyProgress] = useState<QuizProgress | null>(null)
  const [surveyResults, setSurveyResults] = useState<{ questions: SurveyQuestion[]; rows: SurveyResultRow[] } | null>(null)
  const [showSurveyResults, setShowSurveyResults] = useState(false)

  // 제퍼디 상태
  const [jeopardyQuestions, setJeopardyQuestions] = useState<JeopardyQuestion[]>([])
  const [jeopardyState, setJeopardyState] = useState<{
    current_question: JeopardyQuestion | null
    buzzer_winner: { id: string; nickname: string; score: number } | null
    buzzer_answer: string | null
  }>({ current_question: null, buzzer_winner: null, buzzer_answer: null })

  useEffect(() => {
    fetchRoom()
    fetchParticipants()
  }, [id])

  // 별도 폴링 - room 상태 변경 시 재설정
  useEffect(() => {
    const interval = setInterval(() => {
      fetchParticipants()
      if (room?.game_type === 'quiz') {
        fetchQuestions()
        if (room?.status === 'in_progress') {
          fetchQuizProgress()
        }
      } else if (room?.game_type === 'drawing') {
        fetchDrawingWords()
        if (room?.status === 'in_progress') {
          fetchDrawingRoundStatus()
        }
      } else if (room?.game_type === 'ladder') {
        fetchLadderItems()
        if (room?.status === 'in_progress') {
          fetchLadderGame()
        }
      } else if (room?.game_type === 'survey') {
        fetchSurveyQuestions()
        if (room?.status === 'in_progress') {
          fetchSurveyProgress()
        }
      } else if (room?.game_type === 'jeopardy') {
        fetchJeopardyQuestions()
        if (room?.status === 'in_progress') {
          fetchJeopardyState()
        }
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [id, room?.game_type, room?.status])

  useEffect(() => {
    if (room?.game_type === 'quiz') {
      fetchQuestions()
      if (room?.status === 'in_progress') {
        fetchQuizProgress()
      }
    } else if (room?.game_type === 'drawing') {
      fetchDrawingWords()
      if (room?.status === 'in_progress') {
        fetchDrawingRoundStatus()
      }
    } else if (room?.game_type === 'ladder') {
      fetchLadderItems()
      if (room?.status === 'in_progress') {
        fetchLadderGame()
      }
    } else if (room?.game_type === 'survey') {
      fetchSurveyQuestions()
      if (room?.status === 'in_progress') {
        fetchSurveyProgress()
      }
    } else if (room?.game_type === 'jeopardy') {
      fetchJeopardyQuestions()
      if (room?.status === 'in_progress') {
        fetchJeopardyState()
      }
    }
  }, [room?.game_type, room?.status])

  const fetchJeopardyQuestions = async () => {
    try {
      const response = await apiFetch(`/api/games/jeopardy?room_id=${id}`)
      if (response.ok) {
        const data = await response.json()
        setJeopardyQuestions(data.questions || [])
      }
    } catch (error) {
      console.error('Failed to fetch jeopardy questions:', error)
    }
  }

  const fetchJeopardyState = async () => {
    try {
      const response = await apiFetch(`/api/games/jeopardy/state?room_id=${id}`)
      if (response.ok) {
        const data = await response.json()
        setJeopardyState({
          current_question: data.current_question,
          buzzer_winner: data.buzzer_winner,
          buzzer_answer: data.buzzer_answer ?? null,
        })
      }
    } catch (error) {
      console.error('Failed to fetch jeopardy state:', error)
    }
  }

  const handleJeopardyStart = async () => {
    if (jeopardyQuestions.length === 0) {
      toast.error('문제를 먼저 등록해주세요.')
      return
    }
    setActionLoading(true)
    try {
      const res = await apiFetch('/api/games/jeopardy/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', room_id: id }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || '시작에 실패했습니다.')
        return
      }
      toast.success('제퍼디쇼가 시작되었습니다!')
      await fetchRoom()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleJeopardyEnd = async () => {
    setActionLoading(true)
    try {
      const res = await apiFetch('/api/games/jeopardy/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end', room_id: id }),
      })
      if (!res.ok) {
        toast.error('종료에 실패했습니다.')
        return
      }
      toast.success('제퍼디쇼가 종료되었습니다.')
      await fetchRoom()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleJeopardySelectQuestion = async (questionId: string) => {
    setActionLoading(true)
    try {
      const res = await apiFetch('/api/games/jeopardy/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'select_question', room_id: id, question_id: questionId }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || '문제 선택에 실패했습니다.')
        return
      }
      await fetchJeopardyState()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleJeopardyJudge = async (isCorrect: boolean) => {
    if (!jeopardyState.current_question || !jeopardyState.buzzer_winner) return
    setActionLoading(true)
    try {
      const res = await apiFetch('/api/games/jeopardy/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'judge',
          room_id: id,
          question_id: jeopardyState.current_question.id,
          participant_id: jeopardyState.buzzer_winner.id,
          is_correct: isCorrect,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || '판정에 실패했습니다.')
        return
      }
      const data = await res.json()
      if (isCorrect) {
        toast.success(`정답! +${data.points}점`)
      } else {
        toast.error(`오답! -${data.points}점`)
      }
      await fetchJeopardyState()
      await fetchParticipants()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleJeopardyClearQuestion = async () => {
    setActionLoading(true)
    try {
      const res = await apiFetch('/api/games/jeopardy/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_question', room_id: id }),
      })
      if (!res.ok) {
        toast.error('문제 닫기에 실패했습니다.')
        return
      }
      await fetchJeopardyState()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  const fetchRoom = async () => {
    try {
      const response = await apiFetch(`/api/games/rooms/${id}`)

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
      const response = await apiFetch(`/api/games/rooms/${id}/participants`)
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
      const response = await apiFetch(`/api/games/quiz?room_id=${id}`)
      if (response.ok) {
        const data = await response.json()
        setQuestions(data.questions || [])
      }
    } catch (error) {
      console.error('Failed to fetch questions:', error)
    }
  }

  const fetchQuizProgress = async () => {
    try {
      const response = await apiFetch(`/api/games/quiz/status?room_id=${id}`)
      if (response.ok) {
        const data = await response.json()
        setQuizProgress({
          completed_participants: data.completed_participants || 0,
          total_participants: data.total_participants || 0,
          total_questions: data.total_questions || 0
        })
      }
    } catch (error) {
      console.error('Failed to fetch quiz progress:', error)
    }
  }

  const fetchDrawingWords = async () => {
    try {
      const response = await apiFetch(`/api/games/drawing?room_id=${id}`)
      if (response.ok) {
        const data = await response.json()
        setDrawingWords(data.words || [])
      }
    } catch (error) {
      console.error('Failed to fetch drawing words:', error)
    }
  }

  const fetchDrawingRoundStatus = async () => {
    try {
      const response = await apiFetch(`/api/games/drawing/round?room_id=${id}`)
      if (response.ok) {
        const data = await response.json()
        if (data.current_round) {
          // 그림 데이터도 가져오기
          const drawResponse = await apiFetch(`/api/games/drawing/draw?round_id=${data.current_round.id}`)
          let drawingData = null
          if (drawResponse.ok) {
            const drawData = await drawResponse.json()
            drawingData = drawData.drawing_data
          }

          setCurrentDrawingRound({
            round_num: data.current_round.round_num,
            drawer_nickname: data.drawer?.nickname || '알 수 없음',
            current_word: data.current_word?.word || '',
            drawing_data: drawingData
          })
        } else {
          setCurrentDrawingRound(null)
        }
      }
    } catch (error) {
      console.error('Failed to fetch drawing round status:', error)
    }
  }

  // 사다리 게임 함수들
  const fetchLadderItems = async () => {
    try {
      const response = await apiFetch(`/api/games/ladder?room_id=${id}`)
      if (response.ok) {
        const data = await response.json()
        setLadderItems(data.items || [])
      }
    } catch (error) {
      console.error('Failed to fetch ladder items:', error)
    }
  }

  const fetchLadderGame = async () => {
    try {
      const response = await apiFetch(`/api/games/ladder/game?room_id=${id}`)
      if (response.ok) {
        const data = await response.json()
        setLadderGame(data)
      }
    } catch (error) {
      console.error('Failed to fetch ladder game:', error)
    }
  }

  const handleLadderStart = async () => {
    if (ladderItems.length < 2) {
      toast.error('최소 2개의 결과 항목이 필요합니다.')
      return
    }

    setActionLoading(true)
    try {
      const response = await apiFetch('/api/games/ladder/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: id, action: 'start' }),
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || '게임 시작에 실패했습니다.')
        return
      }

      toast.success('사다리 게임이 시작되었습니다!')
      await fetchRoom()
      await fetchLadderGame()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleLadderReveal = async (participantId: string) => {
    setActionLoading(true)
    try {
      const response = await apiFetch('/api/games/ladder/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: id, action: 'reveal', participant_id: participantId }),
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || '결과 공개에 실패했습니다.')
        return
      }

      toast.success('결과가 공개되었습니다!')
      await fetchLadderGame()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleLadderEnd = async () => {
    setActionLoading(true)
    try {
      const response = await apiFetch('/api/games/ladder/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: id, action: 'end' }),
      })

      if (!response.ok) {
        toast.error('게임 종료에 실패했습니다.')
        return
      }

      toast.success('사다리 게임이 종료되었습니다.')
      await fetchRoom()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleLadderSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!ladderForm.item_text.trim()) {
      toast.error('결과 항목을 입력해주세요.')
      return
    }

    setActionLoading(true)
    try {
      const url = editingItemId
        ? `/api/games/ladder/${editingItemId}`
        : '/api/games/ladder'
      const method = editingItemId ? 'PATCH' : 'POST'

      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: id,
          item_text: ladderForm.item_text.trim(),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || '저장에 실패했습니다.')
        return
      }

      toast.success(editingItemId ? '결과 항목이 수정되었습니다.' : '결과 항목이 추가되었습니다.')
      setShowLadderModal(false)
      resetLadderForm()
      await fetchLadderItems()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  const resetLadderForm = () => {
    setLadderForm({ item_text: '' })
    setEditingItemId(null)
  }

  const handleEditItem = (item: LadderItem) => {
    setLadderForm({ item_text: item.item_text })
    setEditingItemId(item.id)
    setShowLadderModal(true)
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('이 결과 항목을 삭제하시겠습니까?')) return

    try {
      const response = await apiFetch(`/api/games/ladder/${itemId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        toast.error('삭제에 실패했습니다.')
        return
      }

      toast.success('결과 항목이 삭제되었습니다.')
      await fetchLadderItems()
    } catch {
      toast.error('오류가 발생했습니다.')
    }
  }

  const fetchSurveyQuestions = async () => {
    try {
      const response = await apiFetch(`/api/games/survey?room_id=${id}`)
      if (response.ok) {
        const data = await response.json()
        setSurveyQuestions(data.questions || [])
      }
    } catch (error) {
      console.error('Failed to fetch survey questions:', error)
    }
  }

  const fetchSurveyProgress = async () => {
    try {
      const response = await apiFetch(`/api/games/survey/status?room_id=${id}`)
      if (response.ok) {
        const data = await response.json()
        setSurveyProgress({
          completed_participants: data.completed_participants || 0,
          total_participants: data.total_participants || 0,
          total_questions: data.total_questions || 0
        })
      }
    } catch (error) {
      console.error('Failed to fetch survey progress:', error)
    }
  }

  const fetchSurveyResults = async () => {
    try {
      const response = await apiFetch(`/api/games/survey/results?room_id=${id}`)
      if (response.ok) {
        const data = await response.json()
        setSurveyResults(data)
        setShowSurveyResults(true)
      }
    } catch (error) {
      console.error('Failed to fetch survey results:', error)
    }
  }

  const handleSurveyStart = async () => {
    if (surveyQuestions.length === 0) {
      toast.error('설문 문항을 먼저 추가해주세요.')
      return
    }
    setActionLoading(true)
    try {
      const response = await apiFetch('/api/games/survey/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: id, action: 'start' }),
      })
      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || '설문 시작에 실패했습니다.')
        return
      }
      toast.success('설문이 시작되었습니다!')
      await fetchRoom()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSurveyEnd = async () => {
    setActionLoading(true)
    try {
      const response = await apiFetch('/api/games/survey/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: id, action: 'end' }),
      })
      if (!response.ok) {
        toast.error('설문 종료에 실패했습니다.')
        return
      }
      toast.success('설문이 종료되었습니다.')
      await fetchRoom()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSurveySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!surveyForm.question_text.trim()) {
      toast.error('문항을 입력해주세요.')
      return
    }
    if (surveyForm.question_type !== 'short_answer') {
      const count = surveyForm.question_type === 'choice_2' ? 2 : 4
      const filled = surveyForm.options.slice(0, count).filter(o => o.trim())
      if (filled.length !== count) {
        toast.error(`선택지 ${count}개를 모두 입력해주세요.`)
        return
      }
    }
    setActionLoading(true)
    try {
      const count = surveyForm.question_type === 'choice_2' ? 2 : 4
      const payload = {
        room_id: id,
        question_text: surveyForm.question_text.trim(),
        question_type: surveyForm.question_type,
        options: surveyForm.question_type === 'short_answer'
          ? null
          : surveyForm.options.slice(0, count).map(o => o.trim()),
      }
      const url = editingSurveyId ? `/api/games/survey/${editingSurveyId}` : '/api/games/survey'
      const method = editingSurveyId ? 'PATCH' : 'POST'
      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || '저장에 실패했습니다.')
        return
      }
      toast.success(editingSurveyId ? '문항이 수정되었습니다.' : '문항이 추가되었습니다.')
      setShowSurveyModal(false)
      resetSurveyForm()
      await fetchSurveyQuestions()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  const resetSurveyForm = () => {
    setSurveyForm({ question_text: '', question_type: 'short_answer', options: ['', ''] })
    setEditingSurveyId(null)
  }

  const handleEditSurveyQuestion = (q: SurveyQuestion) => {
    setSurveyForm({
      question_text: q.question_text,
      question_type: q.question_type,
      options: q.options ? [...q.options, '', '', ''].slice(0, 4) : ['', '', '', ''],
    })
    setEditingSurveyId(q.id)
    setShowSurveyModal(true)
  }

  const handleDeleteSurveyQuestion = async (questionId: string) => {
    if (!confirm('이 문항을 삭제하시겠습니까?')) return
    try {
      const response = await apiFetch(`/api/games/survey/${questionId}`, { method: 'DELETE' })
      if (!response.ok) {
        toast.error('삭제에 실패했습니다.')
        return
      }
      toast.success('문항이 삭제되었습니다.')
      await fetchSurveyQuestions()
    } catch {
      toast.error('오류가 발생했습니다.')
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
        await handleRoomStatusChange(newStatus)
      }
      return
    }

    // 그림 그리기 게임인 경우
    if (room?.game_type === 'drawing') {
      if (newStatus === 'in_progress') {
        await handleDrawingStart()
      } else if (newStatus === 'finished') {
        await handleDrawingEnd()
      } else {
        await handleRoomStatusChange(newStatus)
      }
      return
    }

    // 사다리 게임인 경우
    if (room?.game_type === 'ladder') {
      if (newStatus === 'in_progress') {
        await handleLadderStart()
      } else if (newStatus === 'finished') {
        await handleLadderEnd()
      } else {
        await handleRoomStatusChange(newStatus)
      }
      return
    }

    // 설문조사인 경우
    if (room?.game_type === 'survey') {
      if (newStatus === 'in_progress') {
        await handleSurveyStart()
      } else if (newStatus === 'finished') {
        await handleSurveyEnd()
      } else {
        await handleRoomStatusChange(newStatus)
      }
      return
    }

    // 제퍼디인 경우
    if (room?.game_type === 'jeopardy') {
      if (newStatus === 'in_progress') {
        await handleJeopardyStart()
      } else if (newStatus === 'finished') {
        await handleJeopardyEnd()
      } else {
        await handleRoomStatusChange(newStatus)
      }
      return
    }

    await handleRoomStatusChange(newStatus)
  }

  const handleRoomStatusChange = async (newStatus: 'waiting' | 'in_progress' | 'finished') => {
    setActionLoading(true)

    try {
      const response = await apiFetch(`/api/games/rooms/${id}`, {
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
      const response = await apiFetch('/api/games/quiz/status', {
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
      const response = await apiFetch('/api/games/quiz/status', {
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

  // 그림 그리기 게임 시작
  const handleDrawingStart = async () => {
    if (drawingWords.length === 0) {
      toast.error('제시어를 먼저 추가해주세요.')
      return
    }

    if (!selectedDrawerId) {
      toast.error('그림 그릴 사람을 선택해주세요.')
      return
    }

    setActionLoading(true)
    try {
      const response = await apiFetch('/api/games/drawing/round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: id, action: 'start', drawer_id: selectedDrawerId }),
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || '게임 시작에 실패했습니다.')
        return
      }

      toast.success('그림 그리기 게임이 시작되었습니다!')
      setSelectedDrawerId('')
      await fetchRoom()
      await fetchDrawingRoundStatus()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  // 그림 그리기 다음 라운드
  const handleDrawingNext = async () => {
    if (!selectedDrawerId) {
      toast.error('다음 그림 그릴 사람을 선택해주세요.')
      return
    }

    setActionLoading(true)
    try {
      const response = await apiFetch('/api/games/drawing/round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: id, action: 'next', drawer_id: selectedDrawerId }),
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || '다음 라운드로 이동 실패')
        return
      }

      const data = await response.json()
      if (data.finished) {
        toast.success('모든 라운드가 끝났습니다!')
        setCurrentDrawingRound(null)
      } else {
        toast.success(data.message)
        await fetchDrawingRoundStatus()
      }
      setSelectedDrawerId('')
      await fetchRoom()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  // 그림 그리기 게임 종료
  const handleDrawingEnd = async () => {
    setActionLoading(true)
    try {
      const response = await apiFetch('/api/games/drawing/round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: id, action: 'end' }),
      })

      if (!response.ok) {
        toast.error('게임 종료에 실패했습니다.')
        return
      }

      toast.success('그림 그리기 게임이 종료되었습니다.')
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
      const response = await apiFetch(`/api/games/rooms/${id}`, {
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
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
      const url = `${window.location.origin}${basePath}/join/${room.room_code}`
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
        response = await apiFetch(`/api/games/quiz/${editingQuestionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        response = await apiFetch('/api/games/quiz', {
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

  const openQuizHistory = async (questionId: string | null) => {
    setHistoryQuestionId(questionId)
    setShowHistoryModal(true)
    setHistoryLoading(true)

    try {
      const query = questionId ? `&question_id=${questionId}` : ''
      const res = await apiFetch(`/api/games/quiz/history?room_id=${id}${query}`)
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || '이력을 불러오지 못했습니다.')
        setHistoryEntries([])
        return
      }

      setHistoryEntries(data.history || [])
    } catch (error) {
      console.error('퀴즈 이력 조회 오류:', error)
      toast.error('이력을 불러오지 못했습니다.')
      setHistoryEntries([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleDownloadQuizPDF = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const questionsHTML = questions.map((q, i) => {
      const optionsHTML = q.question_type === 'ox'
        ? '<p style="margin:4px 0;color:#555;">선택지: O / X</p>'
        : q.options.map((opt, idx) => `<p style="margin:2px 0;color:#555;">${idx + 1}. ${opt}</p>`).join('')

      return `
        <div style="margin-bottom:20px;padding:16px;border:1px solid #e0e0e0;border-radius:8px;page-break-inside:avoid;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="font-size:13px;color:#888;font-weight:600;">#${q.order_num}</span>
            <span style="font-size:12px;padding:2px 8px;border-radius:4px;background:${q.question_type === 'ox' ? '#dbeafe' : '#ede9fe'};color:${q.question_type === 'ox' ? '#1d4ed8' : '#6d28d9'};">
              ${q.question_type === 'ox' ? 'O/X' : '객관식'}
            </span>
            <span style="font-size:12px;color:#888;">${q.time_limit}초 | ${q.points}점</span>
          </div>
          <p style="font-weight:600;font-size:15px;margin:0 0 8px;white-space:pre-wrap;">${q.question_text}</p>
          ${optionsHTML}
          <p style="margin-top:8px;font-size:13px;color:#16a34a;font-weight:600;">정답: ${q.correct_answer}</p>
        </div>
      `
    }).join('')

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${room?.room_name} - 퀴즈 문제지</title>
          <style>
            body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; padding: 32px; max-width: 800px; margin: 0 auto; color: #111; }
            h1 { font-size: 22px; margin-bottom: 4px; }
            .meta { font-size: 13px; color: #888; margin-bottom: 24px; }
            @media print { body { padding: 16px; } }
          </style>
        </head>
        <body>
          <h1>${room?.room_name}</h1>
          <p class="meta">방 코드: ${room?.room_code} &nbsp;|&nbsp; 총 ${questions.length}문제</p>
          ${questionsHTML}
          <script>window.onload = () => { window.print(); }</script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('이 문제를 삭제하시겠습니까?')) return

    try {
      const response = await apiFetch(`/api/games/quiz/${questionId}`, {
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

  // 그림 그리기 제시어 추가/수정
  const handleDrawingSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!drawingForm.word.trim()) {
      toast.error('제시어를 입력해주세요.')
      return
    }

    setActionLoading(true)
    try {
      const url = editingWordId
        ? `/api/games/drawing/${editingWordId}`
        : '/api/games/drawing'
      const method = editingWordId ? 'PATCH' : 'POST'

      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: id,
          word: drawingForm.word.trim(),
          hint: drawingForm.hint.trim() || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || '저장에 실패했습니다.')
        return
      }

      toast.success(editingWordId ? '제시어가 수정되었습니다.' : '제시어가 추가되었습니다.')
      setShowDrawingModal(false)
      resetDrawingForm()
      await fetchDrawingWords()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  const resetDrawingForm = () => {
    setDrawingForm({
      word: '',
      hint: '',
    })
    setEditingWordId(null)
  }

  const handleEditWord = (word: DrawingWord) => {
    setDrawingForm({
      word: word.word,
      hint: word.hint || '',
    })
    setEditingWordId(word.id)
    setShowDrawingModal(true)
  }

  const handleDeleteWord = async (wordId: string) => {
    if (!confirm('이 제시어를 삭제하시겠습니까?')) return

    try {
      const response = await apiFetch(`/api/games/drawing/${wordId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        toast.error('삭제에 실패했습니다.')
        return
      }

      toast.success('제시어가 삭제되었습니다.')
      await fetchDrawingWords()
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
  const isDrawingGame = room.game_type === 'drawing'
  const isLadderGame = room.game_type === 'ladder'
  const isSurveyGame = room.game_type === 'survey'
  const isJeopardyGame = room.game_type === 'jeopardy'

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

      <main className="container mx-auto px-3 py-4 max-w-lg">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-xl font-bold">{room.room_name}</h1>
            <span
              className={`px-2 py-0.5 text-xs rounded-full ${
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
          <p className="text-sm text-muted-foreground">
            {GAME_TYPES[room.game_type] || room.game_type}
            {isQuizGame && room.status === 'in_progress' && quizProgress && (
              <span className="ml-2">
                - 완료: {quizProgress.completed_participants} / {quizProgress.total_participants}명
              </span>
            )}
          </p>
        </div>

        <div className="grid gap-4">
          {/* 방 정보 + 게임 컨트롤 통합 */}
          <Card>
            <CardContent className="pt-4 space-y-4">
              {/* 방 코드 */}
              <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">방 코드</p>
                  <p className="text-2xl font-mono font-bold">{room.room_code}</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={copyRoomCode} variant="outline" size="sm">
                    복사
                  </Button>
                  <Button onClick={copyJoinUrl} variant="outline" size="sm">
                    링크
                  </Button>
                </div>
              </div>

              {/* 참가자 수 */}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">참가자</span>
                <span>{activeParticipants.length} / {room.max_participants}명</span>
              </div>

              <hr />

              {/* 그림 그리기 게임: 그리는 사람 선택 */}
              {isDrawingGame && room.status === 'waiting' && participants.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium">그림 그릴 사람</label>
                  <select
                    className="w-full p-2 border rounded-md text-sm"
                    value={selectedDrawerId}
                    onChange={(e) => setSelectedDrawerId(e.target.value)}
                  >
                    <option value="">선택해주세요</option>
                    {participants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nickname}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 게임 상태 버튼 */}
              {room.status === 'waiting' && (
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={() => handleStatusChange('in_progress')}
                  disabled={
                    actionLoading ||
                    (isQuizGame && questions.length === 0) ||
                    (isDrawingGame && (!selectedDrawerId || drawingWords.length === 0)) ||
                    (isLadderGame && ladderItems.length < 2) ||
                    (isSurveyGame && surveyQuestions.length === 0) ||
                    (isJeopardyGame && jeopardyQuestions.length === 0)
                  }
                >
                  {isQuizGame ? '퀴즈 시작' : isLadderGame ? '사다리 시작' : isSurveyGame ? '설문 시작' : isJeopardyGame ? '제퍼디 시작' : '게임 시작'}
                </Button>
              )}
              {room.status === 'in_progress' && (
                <Button
                  className="w-full"
                  variant="destructive"
                  onClick={() => handleStatusChange('finished')}
                  disabled={actionLoading}
                >
                  게임 종료
                </Button>
              )}
              {room.status === 'finished' && (
                <Button
                  className="w-full"
                  onClick={() => handleStatusChange('waiting')}
                  disabled={actionLoading}
                >
                  다시 대기 상태로
                </Button>
              )}

              {/* 경고 메시지 */}
              {isQuizGame && questions.length === 0 && room.status === 'waiting' && (
                <p className="text-xs text-amber-600 text-center">
                  퀴즈 문제를 먼저 추가해주세요
                </p>
              )}
              {isDrawingGame && drawingWords.length === 0 && room.status === 'waiting' && (
                <p className="text-xs text-amber-600 text-center">
                  제시어를 먼저 추가해주세요
                </p>
              )}
              {isLadderGame && ladderItems.length < 2 && room.status === 'waiting' && (
                <p className="text-xs text-amber-600 text-center">
                  최소 2개의 결과 항목을 추가해주세요
                </p>
              )}
              {isSurveyGame && surveyQuestions.length === 0 && room.status === 'waiting' && (
                <p className="text-xs text-amber-600 text-center">
                  설문 문항을 먼저 추가해주세요
                </p>
              )}
              {isJeopardyGame && jeopardyQuestions.length === 0 && room.status === 'waiting' && (
                <p className="text-xs text-amber-600 text-center">
                  엑셀 파일로 문제를 먼저 등록해주세요
                </p>
              )}

              <hr />

              {/* 방 삭제 버튼 */}
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

          {/* 퀴즈 게임: 진행 상태 표시 (개인별 진행 방식) */}
          {isQuizGame && room.status === 'in_progress' && quizProgress && (
            <Card className="md:col-span-2 border-2 border-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-2xl">📊</span>
                  퀴즈 진행 현황
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-4 bg-blue-50 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">총 문제 수</p>
                    <p className="text-3xl font-bold text-blue-600">{quizProgress.total_questions}</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">완료한 참가자</p>
                    <p className="text-3xl font-bold text-green-600">
                      {quizProgress.completed_participants} / {quizProgress.total_participants}
                    </p>
                  </div>
                </div>
                <div className="bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div
                    className="bg-green-500 h-full transition-all duration-500"
                    style={{
                      width: quizProgress.total_participants > 0
                        ? `${(quizProgress.completed_participants / quizProgress.total_participants) * 100}%`
                        : '0%'
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  각 참가자가 자신의 속도로 문제를 풀고 있습니다
                </p>
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
                  <div className="flex gap-2">
                    {questions.length > 0 && (
                      <Button
                        variant="outline"
                        onClick={() => router.push(`/room/${id}/quiz-results`)}
                      >
                        결과 통계
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => openQuizHistory(null)}>
                      변경 이력
                    </Button>
                    {questions.length > 0 && (
                      <Button variant="outline" onClick={handleDownloadQuizPDF}>
                        PDF 다운로드
                      </Button>
                    )}
                    {room.status === 'waiting' && (
                      <Button onClick={() => { resetQuizForm(); setShowQuizModal(true); }}>
                        + 문제 추가
                      </Button>
                    )}
                  </div>
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
                          <p className="font-medium whitespace-pre-wrap">{question.question_text}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            정답: {question.correct_answer} | {question.time_limit}초 | {question.points}점
                          </p>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openQuizHistory(question.id)}
                          >
                            이력
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditQuestion(question)}
                          >
                            수정
                          </Button>
                          {room.status === 'waiting' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleDeleteQuestion(question.id)}
                            >
                              삭제
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 그림 그리기 게임: 제시어 목록 */}
          {isDrawingGame && room.status !== 'in_progress' && (
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>제시어 목록</CardTitle>
                    <CardDescription>총 {drawingWords.length}개의 제시어</CardDescription>
                  </div>
                  {room.status === 'waiting' && (
                    <Button onClick={() => { resetDrawingForm(); setShowDrawingModal(true); }}>
                      + 제시어 추가
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {drawingWords.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>제시어가 없습니다.</p>
                    {room.status === 'waiting' && (
                      <Button
                        className="mt-4"
                        variant="outline"
                        onClick={() => { resetDrawingForm(); setShowDrawingModal(true); }}
                      >
                        첫 번째 제시어 추가하기
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {drawingWords.map((word) => (
                      <div
                        key={word.id}
                        className="p-4 border rounded-lg flex justify-between items-center"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground">
                              #{word.order_num}
                            </span>
                            <span className="font-medium text-lg">{word.word}</span>
                          </div>
                          {word.hint && (
                            <p className="text-sm text-muted-foreground mt-1">
                              힌트: {word.hint}
                            </p>
                          )}
                        </div>
                        {room.status === 'waiting' && (
                          <div className="flex gap-2 ml-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditWord(word)}
                            >
                              수정
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleDeleteWord(word.id)}
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

          {/* 그림 그리기 게임: 진행 상태 */}
          {isDrawingGame && room.status === 'in_progress' && (
            <Card className="border-2 border-primary">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span>🎨</span>
                  라운드 {currentDrawingRound?.round_num || 1} / {drawingWords.length}
                </CardTitle>
                {currentDrawingRound && (
                  <div className="text-xs space-y-1">
                    <p>그리는 사람: <span className="font-medium">{currentDrawingRound.drawer_nickname}</span></p>
                    <p>제시어: <span className="font-bold text-primary">{currentDrawingRound.current_word}</span></p>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {/* 그림 표시 영역 */}
                <div className="border rounded-lg bg-white w-full aspect-square flex items-center justify-center">
                  {currentDrawingRound?.drawing_data ? (
                    <img
                      src={currentDrawingRound.drawing_data}
                      alt="현재 그림"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">그림을 기다리는 중...</p>
                  )}
                </div>
                {/* 다음 그리는 사람 선택 */}
                <div className="space-y-1">
                  <label className="text-xs font-medium">다음 그릴 사람</label>
                  <select
                    className="w-full p-2 border rounded-md text-sm"
                    value={selectedDrawerId}
                    onChange={(e) => setSelectedDrawerId(e.target.value)}
                  >
                    <option value="">선택해주세요</option>
                    {participants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nickname}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    size="sm"
                    variant="outline"
                    onClick={handleDrawingNext}
                    disabled={actionLoading || !selectedDrawerId}
                  >
                    다음 라운드
                  </Button>
                  <Button
                    className="flex-1"
                    size="sm"
                    variant="destructive"
                    onClick={handleDrawingEnd}
                    disabled={actionLoading}
                  >
                    게임 종료
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 사다리 게임: 결과 항목 목록 (대기/종료 상태) */}
          {isLadderGame && room.status !== 'in_progress' && (
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>결과 항목</CardTitle>
                    <CardDescription>총 {ladderItems.length}개의 항목</CardDescription>
                  </div>
                  {room.status === 'waiting' && (
                    <Button onClick={() => { resetLadderForm(); setShowLadderModal(true); }}>
                      + 항목 추가
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {ladderItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>결과 항목이 없습니다.</p>
                    {room.status === 'waiting' && (
                      <Button
                        className="mt-4"
                        variant="outline"
                        onClick={() => { resetLadderForm(); setShowLadderModal(true); }}
                      >
                        첫 번째 항목 추가하기
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ladderItems.map((item, idx) => (
                      <div
                        key={item.id}
                        className="p-3 border rounded-lg flex justify-between items-center"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                            {idx + 1}
                          </span>
                          <span className="font-medium">{item.item_text}</span>
                        </div>
                        {room.status === 'waiting' && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditItem(item)}
                            >
                              수정
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleDeleteItem(item.id)}
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

          {/* 사다리 게임: 진행 상태 */}
          {isLadderGame && room.status === 'in_progress' && ladderGame && (
            <Card className="border-2 border-primary">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span>🪜</span>
                  사다리 게임 진행 중
                </CardTitle>
                <CardDescription>
                  선택: {ladderGame.selections.length} / {ladderGame.ladder_data?.lines_count || 0}명
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 참가자 선택 현황 및 결과 공개 */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">참가자 결과</p>
                  {ladderGame.selections.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      아직 참가자가 출발점을 선택하지 않았습니다.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {ladderGame.selections.map((selection) => {
                        const resultItem = selection.is_revealed && selection.result_position !== null
                          ? ladderGame.items.find(i => i.position === selection.result_position)
                          : null
                        return (
                          <div
                            key={selection.id}
                            className="p-3 border rounded-lg flex justify-between items-center"
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
                                {selection.start_position + 1}
                              </span>
                              <span className="font-medium">
                                {selection.game_participants?.nickname || '알 수 없음'}
                              </span>
                              {selection.is_revealed && resultItem && (
                                <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm">
                                  → {resultItem.item_text}
                                </span>
                              )}
                            </div>
                            {!selection.is_revealed && (
                              <Button
                                size="sm"
                                onClick={() => handleLadderReveal(selection.participant_id)}
                                disabled={actionLoading}
                              >
                                결과 공개
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* 결과 항목 목록 (하단) */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">도착 결과</p>
                  <div className="grid grid-cols-2 gap-2">
                    {ladderGame.items.map((item, idx) => {
                      const revealedSelection = ladderGame.selections.find(
                        s => s.is_revealed && s.result_position === item.position
                      )
                      return (
                        <div
                          key={item.id}
                          className={`p-2 rounded-lg text-center text-sm ${
                            revealedSelection
                              ? 'bg-green-100 text-green-700 border-2 border-green-300'
                              : 'bg-muted'
                          }`}
                        >
                          <span className="font-medium">{idx + 1}. {item.item_text}</span>
                          {revealedSelection && (
                            <p className="text-xs mt-1">
                              {revealedSelection.game_participants?.nickname}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <Button
                  className="w-full"
                  variant="destructive"
                  onClick={handleLadderEnd}
                  disabled={actionLoading}
                >
                  게임 종료
                </Button>
              </CardContent>
            </Card>
          )}

          {/* 설문조사: 문항 목록 (대기/종료 상태) */}
          {isSurveyGame && room.status !== 'in_progress' && (
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>설문 문항 목록</CardTitle>
                    <CardDescription>총 {surveyQuestions.length}개의 문항</CardDescription>
                  </div>
                  {room.status === 'waiting' && (
                    <Button onClick={() => { resetSurveyForm(); setShowSurveyModal(true); }}>
                      + 문항 추가
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {surveyQuestions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>설문 문항이 없습니다.</p>
                    {room.status === 'waiting' && (
                      <Button
                        className="mt-4"
                        variant="outline"
                        onClick={() => { resetSurveyForm(); setShowSurveyModal(true); }}
                      >
                        첫 번째 문항 추가하기
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {surveyQuestions.map((q) => (
                      <div key={q.id} className="p-4 border rounded-lg flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-muted-foreground">#{q.order_num}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              q.question_type === 'short_answer'
                                ? 'bg-blue-100 text-blue-700'
                                : q.question_type === 'choice_2'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {q.question_type === 'short_answer' ? '주관식' : q.question_type === 'choice_2' ? '2지선다' : '4지선다'}
                            </span>
                          </div>
                          <p className="font-medium whitespace-pre-wrap">{q.question_text}</p>
                          {q.options && (
                            <p className="text-sm text-muted-foreground mt-1">
                              선택지: {q.options.join(' / ')}
                            </p>
                          )}
                        </div>
                        {room.status === 'waiting' && (
                          <div className="flex gap-2 ml-4">
                            <Button variant="outline" size="sm" onClick={() => handleEditSurveyQuestion(q)}>수정</Button>
                            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteSurveyQuestion(q.id)}>삭제</Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {room.status === 'finished' && (
                  <div className="mt-4">
                    <Button className="w-full" variant="outline" onClick={() => router.push(`/room/${id}/survey-results`)}>
                      결과 보기 (전체화면)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 설문조사: 진행 현황 */}
          {isSurveyGame && room.status === 'in_progress' && surveyProgress && (
            <Card className="border-2 border-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-2xl">📋</span>
                  설문 진행 현황
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-4 bg-blue-50 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">총 문항 수</p>
                    <p className="text-3xl font-bold text-blue-600">{surveyProgress.total_questions}</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">완료한 참가자</p>
                    <p className="text-3xl font-bold text-green-600">
                      {surveyProgress.completed_participants} / {surveyProgress.total_participants}
                    </p>
                  </div>
                </div>
                <div className="bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div
                    className="bg-green-500 h-full transition-all duration-500"
                    style={{
                      width: surveyProgress.total_participants > 0
                        ? `${(surveyProgress.completed_participants / surveyProgress.total_participants) * 100}%`
                        : '0%'
                    }}
                  />
                </div>
                <div className="mt-4">
                  <Button className="w-full" variant="outline" onClick={() => router.push(`/room/${id}/survey-results`)}>
                    중간 결과 보기 (전체화면)
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 설문조사: 결과 데이터프레임 테이블 */}
          {isSurveyGame && showSurveyResults && surveyResults && (
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>설문 결과</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setShowSurveyResults(false)}>닫기</Button>
                </div>
              </CardHeader>
              <CardContent>
                {surveyResults.rows.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">아직 답변이 없습니다.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr>
                          <th className="border p-2 bg-muted text-left whitespace-nowrap">참가자</th>
                          {surveyResults.questions.map((q) => (
                            <th key={q.id} className="border p-2 bg-muted text-left min-w-[120px]">
                              <div className="text-xs text-muted-foreground">Q{q.order_num}</div>
                              <div className="truncate max-w-[150px]">{q.question_text}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {surveyResults.rows.map((row) => (
                          <tr key={row.participant_id} className="hover:bg-muted/50">
                            <td className="border p-2 font-medium whitespace-nowrap">{row.nickname}</td>
                            {surveyResults.questions.map((q) => (
                              <td key={q.id} className="border p-2 text-muted-foreground">
                                {row.answers[q.id] || '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 제퍼디쇼: 게임 보드 (진행 중) */}
          {isJeopardyGame && room.status === 'in_progress' && (
            <Card className="border-2 border-primary">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <span>🎯</span>
                  제퍼디쇼 진행 중
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {jeopardyState.current_question ? (
                  /* 문제 표시 + 버저 판정 */
                  <div className="space-y-3">
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                          {jeopardyState.current_question.category}
                        </span>
                        <span className="text-sm font-bold text-primary">
                          {jeopardyState.current_question.points}점
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {jeopardyState.current_question.question_type === 'short_answer' ? '주관식' :
                           jeopardyState.current_question.question_type === '2지선다' ? '2지선다' : '4지선다'}
                        </span>
                      </div>
                      <p className="font-medium whitespace-pre-wrap text-sm mb-3">
                        {jeopardyState.current_question.content}
                      </p>
                      {jeopardyState.current_question.question_type !== 'short_answer' && (
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          {jeopardyState.current_question.options.map((opt, i) => (
                            <div key={i} className="text-xs bg-white border rounded p-2">
                              {opt}
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        정답: <span className="font-bold text-foreground">{jeopardyState.current_question.answer}</span>
                      </p>
                    </div>

                    {jeopardyState.buzzer_winner ? (
                      /* 버저 당첨자 있음 → 판정 */
                      <div className="space-y-2">
                        <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-lg text-center">
                          <p className="text-sm text-yellow-700">버저 선점!</p>
                          <p className="text-xl font-bold">{jeopardyState.buzzer_winner.nickname}</p>
                          <p className="text-xs text-muted-foreground">현재 {jeopardyState.buzzer_winner.score}점</p>
                          {jeopardyState.buzzer_answer != null ? (
                            <div className="mt-2 px-3 py-2 bg-white border border-yellow-400 rounded text-sm font-semibold text-gray-800">
                              제출한 답변: {jeopardyState.buzzer_answer}
                            </div>
                          ) : (
                            <p className="mt-1 text-xs text-yellow-600 italic">답변 대기 중...</p>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => handleJeopardyJudge(true)}
                            disabled={actionLoading}
                          >
                            ✓ 정답 (+{jeopardyState.current_question.points}점)
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => handleJeopardyJudge(false)}
                            disabled={actionLoading}
                          >
                            ✗ 오답 (-{jeopardyState.current_question.points}점)
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* 버저 대기 중 */
                      <div className="p-3 bg-muted rounded-lg text-center">
                        <p className="text-sm text-muted-foreground">버저를 기다리는 중...</p>
                      </div>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleJeopardyClearQuestion}
                      disabled={actionLoading}
                    >
                      문제 닫기 (보드로 돌아가기)
                    </Button>
                  </div>
                ) : (
                  /* 보드 표시 - 행=카테고리, 열=점수 */
                  (() => {
                    const cats = [...new Set(jeopardyQuestions.map(q => q.category))]
                    const pts = [...new Set(jeopardyQuestions.map(q => q.points))].sort((a, b) => a - b)
                    return (
                      <div className="overflow-x-auto">
                        <p className="text-xs text-muted-foreground mb-2">문제를 클릭하면 화면에 표시됩니다</p>
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr>
                              <th className="border px-2 py-1 bg-muted text-left">카테고리</th>
                              {pts.map(p => (
                                <th key={p} className="border px-2 py-1 bg-muted text-center w-14">{p}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {cats.map(cat => (
                              <tr key={cat}>
                                <td className="border px-2 py-1 font-medium text-sm">{cat}</td>
                                {pts.map(p => {
                                  const q = jeopardyQuestions.find(q => q.category === cat && q.points === p)
                                  return (
                                    <td key={p} className="border p-1 text-center">
                                      {q ? (
                                        q.is_used ? (
                                          <span className="text-gray-300 text-lg">✓</span>
                                        ) : (
                                          <button
                                            onClick={() => handleJeopardySelectQuestion(q.id)}
                                            disabled={actionLoading}
                                            className="w-full py-2 px-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 font-bold transition-colors disabled:opacity-50"
                                          >
                                            {p}
                                          </button>
                                        )
                                      ) : (
                                        <span className="text-gray-300">-</span>
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })()
                )}

                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={handleJeopardyEnd}
                  disabled={actionLoading}
                >
                  게임 종료
                </Button>
              </CardContent>
            </Card>
          )}

          {/* 제퍼디쇼: 문제 업로드 (대기/종료 상태) */}
          {isJeopardyGame && room.status !== 'in_progress' && (
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">문제 등록</CardTitle>
                <CardDescription className="text-xs">
                  엑셀 파일로 제퍼디 문제를 일괄 등록합니다.
                  {room.status === 'finished' && ' (종료된 게임은 문제를 수정할 수 없습니다.)'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {room.status === 'waiting' ? (
                  <JeopardyUpload
                    roomId={room.id}
                    existingQuestions={jeopardyQuestions}
                    onUploadSuccess={fetchJeopardyQuestions}
                  />
                ) : (
                  jeopardyQuestions.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      총 {jeopardyQuestions.length}개 문제가 등록되어 있습니다.
                    </p>
                  )
                )}
              </CardContent>
            </Card>
          )}

          {/* 참가자 목록 */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-base">참가자</CardTitle>
                <Button variant="outline" size="sm" onClick={fetchParticipants}>
                  새로고침
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {activeParticipants.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <p className="text-sm">아직 참가자가 없습니다.</p>
                  <p className="text-xs mt-1">
                    방 코드 <span className="font-mono font-bold">{room.room_code}</span>를 공유하세요
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {activeParticipants
                    .sort((a, b) => b.score - a.score)
                    .map((participant, index) => (
                    <div
                      key={participant.id}
                      className="flex flex-col items-center p-2 bg-muted rounded-lg"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm mb-1 ${
                        index === 0 ? 'bg-yellow-400 text-yellow-900' :
                        index === 1 ? 'bg-gray-300 text-gray-700' :
                        index === 2 ? 'bg-amber-600 text-amber-100' :
                        'bg-primary/10'
                      }`}>
                        {index < 3 ? ['🥇', '🥈', '🥉'][index] : index + 1}
                      </div>
                      <p className="text-xs font-medium text-center truncate w-full">
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
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold">퀴즈 변경 이력</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {historyQuestionId ? '이 문제의 이력' : '이 방의 전체 이력'}
                  </p>
                </div>
                {historyQuestionId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openQuizHistory(null)}
                  >
                    전체 보기
                  </Button>
                )}
              </div>

              {historyLoading ? (
                <p className="text-center text-gray-500 py-8">불러오는 중...</p>
              ) : historyEntries.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  기록된 변경 이력이 없습니다.
                </p>
              ) : (
                <div className="space-y-3">
                  {historyEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="border rounded-lg p-4 dark:border-gray-700"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium ${
                            entry.action === 'create'
                              ? 'bg-green-100 text-green-700'
                              : entry.action === 'delete'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {QUIZ_HISTORY_ACTIONS[entry.action]}
                        </span>
                        {entry.order_num !== null && (
                          <span className="text-xs text-gray-500">
                            #{entry.order_num}
                          </span>
                        )}
                        {/* 게임 진행 중 수정은 채점 결과와 어긋날 수 있어 눈에 띄게 표시 */}
                        {entry.room_status === 'in_progress' && (
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                            게임 진행 중 변경
                          </span>
                        )}
                        <span className="text-xs text-gray-500 ml-auto">
                          {new Date(entry.created_at).toLocaleString('ko-KR')}
                        </span>
                      </div>

                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {entry.instructor_name || '알 수 없음'}
                      </p>

                      {entry.action === 'update' ? (
                        <div className="space-y-2">
                          {orderChangedFields(entry.changed_fields).map((field) => {
                            const change = entry.changed_fields[field]
                            const context = resolveHistoryContext(entry)

                            // 선택지: 번호별로 짝지어 비교. 바뀐 번호만 강조하고 나머지는 맥락용으로 흐리게
                            if (field === 'options') {
                              return (
                                <div key={field} className="text-sm">
                                  <span className="font-medium">선택지</span>
                                  <div className="mt-1 space-y-0.5">
                                    {buildOptionRows(
                                      change.before,
                                      change.after
                                    ).map((row) => (
                                      <div
                                        key={row.number}
                                        className="flex items-start gap-2"
                                      >
                                        <span
                                          className={`shrink-0 w-6 text-right font-medium ${
                                            row.changed
                                              ? 'text-gray-700 dark:text-gray-200'
                                              : 'text-gray-400'
                                          }`}
                                        >
                                          {row.number}번
                                        </span>
                                        {row.changed ? (
                                          <span className="flex-1">
                                            <span className="text-red-600 line-through">
                                              {formatHistoryValue(row.before)}
                                            </span>
                                            <span className="text-gray-400 mx-1">
                                              →
                                            </span>
                                            <span className="text-green-600">
                                              {formatHistoryValue(row.after)}
                                            </span>
                                          </span>
                                        ) : (
                                          <span className="flex-1 text-gray-400">
                                            {formatHistoryValue(row.after)}
                                            <span className="ml-1 text-xs">
                                              (변경 없음)
                                            </span>
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )
                            }

                            // 정답: 몇 번에서 몇 번으로 바뀌었는지가 핵심이라 번호를 앞세워 강조
                            if (field === 'correct_answer') {
                              // O/X 문제는 번호가 의미 없으므로 전/후 유형을 각각 보고 판단한다
                              const beforeNum =
                                context.questionType.before === 'ox'
                                  ? null
                                  : findOptionNumber(
                                      context.options.before,
                                      change.before
                                    )
                              const afterNum =
                                context.questionType.after === 'ox'
                                  ? null
                                  : findOptionNumber(
                                      context.options.after,
                                      change.after
                                    )

                              return (
                                <div
                                  key={field}
                                  className="text-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-3 py-2"
                                >
                                  <span className="font-medium">정답</span>
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <span className="text-red-600">
                                      {beforeNum !== null && (
                                        <span className="font-bold mr-1">
                                          {beforeNum}번
                                        </span>
                                      )}
                                      <span className="line-through">
                                        {formatHistoryValue(change.before)}
                                      </span>
                                    </span>
                                    <span className="text-gray-400">→</span>
                                    <span className="text-green-600 font-medium">
                                      {afterNum !== null && (
                                        <span className="font-bold mr-1">
                                          {afterNum}번
                                        </span>
                                      )}
                                      {formatHistoryValue(change.after)}
                                    </span>
                                  </div>
                                </div>
                              )
                            }

                            return (
                              <div key={field} className="text-sm">
                                <span className="font-medium">
                                  {QUIZ_FIELD_LABELS[field] || field}
                                </span>
                                <span className="text-gray-400 mx-1">:</span>
                                <span className="text-red-600 line-through">
                                  {formatHistoryValue(change.before)}
                                </span>
                                <span className="text-gray-400 mx-1">→</span>
                                <span className="text-green-600">
                                  {formatHistoryValue(change.after)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        // 생성/삭제는 그 시점의 문제 전체를 번호와 정답 표시까지 함께 보여준다
                        entry.snapshot && (
                          <div className="text-sm space-y-1">
                            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                              {formatHistoryValue(entry.snapshot.question_text)}
                            </p>
                            {Array.isArray(entry.snapshot.options) && (
                              <div className="space-y-0.5">
                                {entry.snapshot.options.map((option, index) => {
                                  const isAnswer =
                                    String(option) ===
                                    String(entry.snapshot?.correct_answer)
                                  return (
                                    <div
                                      key={index}
                                      className={`flex items-start gap-2 ${
                                        isAnswer
                                          ? 'text-green-600 font-medium'
                                          : 'text-gray-500'
                                      }`}
                                    >
                                      <span className="shrink-0 w-6 text-right">
                                        {index + 1}번
                                      </span>
                                      <span className="flex-1">
                                        {formatHistoryValue(option)}
                                        {isAnswer && (
                                          <span className="ml-1 text-xs">
                                            (정답)
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end mt-6">
                <Button
                  variant="outline"
                  onClick={() => setShowHistoryModal(false)}
                >
                  닫기
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* 그림 그리기 제시어 추가/수정 모달 */}
      {showDrawingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {editingWordId ? '제시어 수정' : '새 제시어 추가'}
              </h2>
              <form onSubmit={handleDrawingSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">제시어</label>
                  <Input
                    value={drawingForm.word}
                    onChange={(e) => setDrawingForm({ ...drawingForm, word: e.target.value })}
                    placeholder="예: 사과, 강아지, 비행기"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">힌트 (선택사항)</label>
                  <Input
                    value={drawingForm.hint}
                    onChange={(e) => setDrawingForm({ ...drawingForm, hint: e.target.value })}
                    placeholder="예: 빨간색 과일"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    힌트는 그리는 사람에게만 표시됩니다
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setShowDrawingModal(false); resetDrawingForm(); }}
                  >
                    취소
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={actionLoading}
                  >
                    {actionLoading ? '저장 중...' : editingWordId ? '수정' : '추가'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 설문 문항 추가/수정 모달 */}
      {showSurveyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {editingSurveyId ? '문항 수정' : '새 문항 추가'}
              </h2>
              <form onSubmit={handleSurveySubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">문항 유형</label>
                  <div className="flex gap-4 flex-wrap">
                    {(['short_answer', 'choice_2', 'choice_4'] as const).map((type) => (
                      <label key={type} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="question_type"
                          value={type}
                          checked={surveyForm.question_type === type}
                          onChange={() => setSurveyForm({ ...surveyForm, question_type: type, options: ['', '', '', ''] })}
                        />
                        <span>{type === 'short_answer' ? '주관식' : type === 'choice_2' ? '2지선다' : '4지선다'}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">문항</label>
                  <textarea
                    className="w-full px-3 py-2 border rounded-lg resize-none"
                    rows={3}
                    value={surveyForm.question_text}
                    onChange={(e) => setSurveyForm({ ...surveyForm, question_text: e.target.value })}
                    placeholder="문항을 입력하세요"
                  />
                </div>

                {surveyForm.question_type !== 'short_answer' && (
                  <div>
                    <label className="block text-sm font-medium mb-2">선택지</label>
                    <div className="space-y-2">
                      {Array.from({ length: surveyForm.question_type === 'choice_2' ? 2 : 4 }).map((_, idx) => (
                        <Input
                          key={idx}
                          value={surveyForm.options[idx] || ''}
                          onChange={(e) => {
                            const newOptions = [...surveyForm.options]
                            newOptions[idx] = e.target.value
                            setSurveyForm({ ...surveyForm, options: newOptions })
                          }}
                          placeholder={`선택지 ${idx + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setShowSurveyModal(false); resetSurveyForm(); }}
                  >
                    취소
                  </Button>
                  <Button type="submit" className="flex-1" disabled={actionLoading}>
                    {actionLoading ? '저장 중...' : editingSurveyId ? '수정' : '추가'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 사다리 결과 항목 추가/수정 모달 */}
      {showLadderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {editingItemId ? '결과 항목 수정' : '새 결과 항목 추가'}
              </h2>
              <form onSubmit={handleLadderSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">결과 항목</label>
                  <Input
                    value={ladderForm.item_text}
                    onChange={(e) => setLadderForm({ ...ladderForm, item_text: e.target.value })}
                    placeholder="예: 꽝, 커피 쏘기, 1등"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    사다리 도착 시 받게 될 결과입니다
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setShowLadderModal(false); resetLadderForm(); }}
                  >
                    취소
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={actionLoading}
                  >
                    {actionLoading ? '저장 중...' : editingItemId ? '수정' : '추가'}
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
