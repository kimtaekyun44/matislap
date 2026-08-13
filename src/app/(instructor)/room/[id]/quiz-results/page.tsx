'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/utils/api'

interface DistributionBucket {
  number: number | null
  text: string
  count: number
  percent: number
  is_correct: boolean
  nicknames: string[]
}

interface QuestionStats {
  id: string
  order_num: number
  question_text: string
  question_type: 'multiple_choice' | 'ox'
  correct_answer: string
  total_answers: number
  correct_count: number
  incorrect_count: number
  accuracy: number
  average_time_ms: number
  unanswered_count: number
  distribution: DistributionBucket[]
}

interface RoomInfo {
  room_code: string
  room_name: string
  status: string
}

// 정답률에 따라 색을 달리해 어려운 문제가 눈에 띄게 한다
const accuracyColor = (accuracy: number) => {
  if (accuracy >= 70) return 'text-green-600'
  if (accuracy >= 40) return 'text-amber-600'
  return 'text-red-600'
}

export default function QuizResultsPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()

  const [questions, setQuestions] = useState<QuestionStats[]>([])
  const [participantCount, setParticipantCount] = useState(0)
  const [overallAccuracy, setOverallAccuracy] = useState(0)
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  // 선택지별 명단은 한 단계 더 감춘다. 키는 `문제ID:선택지index`
  const [visibleRosters, setVisibleRosters] = useState<Set<string>>(new Set())

  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, roomRes] = await Promise.all([
        apiFetch(`/api/games/quiz/stats?room_id=${id}`),
        apiFetch(`/api/games/rooms/${id}`),
      ])

      if (roomRes.ok) {
        const roomData = await roomRes.json()
        setRoom({
          room_code: roomData.room.room_code,
          room_name: roomData.room.room_name,
          status: roomData.room.status,
        })
      } else if (roomRes.status === 401) {
        router.push('/login')
        return
      }

      if (statsRes.ok) {
        const data = await statsRes.json()
        setQuestions(data.questions || [])
        setParticipantCount(data.participant_count || 0)
        setOverallAccuracy(data.overall_accuracy || 0)
        setLastUpdated(new Date())
      }
    } catch (error) {
      console.error('퀴즈 통계 조회 오류:', error)
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchStats, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchStats])

  const toggleExpanded = (questionId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) {
        next.delete(questionId)
        // 문제를 접으면 그 문제의 명단도 다시 감춘다 (기본은 항상 비공개)
        setVisibleRosters((rosters) => {
          const remaining = new Set(rosters)
          for (const key of remaining) {
            if (key.startsWith(`${questionId}:`)) remaining.delete(key)
          }
          return remaining
        })
      } else {
        next.add(questionId)
      }
      return next
    })
  }

  const toggleRoster = (key: string) => {
    setVisibleRosters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const allExpanded = questions.length > 0 && expandedIds.size === questions.length

  const toggleAll = () => {
    setExpandedIds(allExpanded ? new Set() : new Set(questions.map((q) => q.id)))
    if (allExpanded) setVisibleRosters(new Set())
  }

  // 응답이 있는 문제 중 정답률이 가장 낮은 문제
  const hardestQuestion = useMemo(() => {
    const answered = questions.filter((q) => q.total_answers > 0)
    if (answered.length === 0) return null
    return answered.reduce((min, q) => (q.accuracy < min.accuracy ? q : min))
  }, [questions])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b shadow-sm sticky top-0 z-20">
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/room/${id}`)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← 방 관리로
            </button>
            <div className="h-4 w-px bg-border" />
            <div>
              <h1 className="font-bold text-base leading-tight">
                {room?.room_name || '퀴즈 결과'}
              </h1>
              <p className="text-xs text-muted-foreground">
                방 코드: <span className="font-mono font-bold">{room?.room_code}</span>
                {room?.status === 'in_progress' && (
                  <span className="ml-2 text-green-600 font-medium">● 진행 중</span>
                )}
                {room?.status === 'finished' && (
                  <span className="ml-2 text-gray-400 font-medium">● 종료됨</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {lastUpdated && (
              <p className="text-xs text-muted-foreground hidden sm:block">
                마지막 업데이트: {lastUpdated.toLocaleTimeString()}
              </p>
            )}
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                autoRefresh
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'bg-gray-50 border-gray-300 text-gray-500'
              }`}
            >
              {autoRefresh ? '● 자동 새로고침 ON' : '자동 새로고침 OFF'}
            </button>
            <button
              onClick={fetchStats}
              className="text-xs px-3 py-1.5 rounded-full border bg-white hover:bg-gray-50 transition-colors"
            >
              새로고침
            </button>
          </div>
        </div>

        {/* 요약 */}
        <div className="px-4 pb-2 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            참가자 <strong className="text-foreground">{participantCount}명</strong>
          </span>
          <span className="text-muted-foreground">
            문항 <strong className="text-foreground">{questions.length}개</strong>
          </span>
          <span className="text-muted-foreground">
            전체 평균 정답률{' '}
            <strong className={accuracyColor(overallAccuracy)}>
              {overallAccuracy}%
            </strong>
          </span>
          {hardestQuestion && (
            <span className="text-muted-foreground">
              최저 정답률{' '}
              <strong className="text-red-600">
                #{hardestQuestion.order_num} ({hardestQuestion.accuracy}%)
              </strong>
            </span>
          )}
          {questions.length > 0 && (
            <button
              onClick={toggleAll}
              className="ml-auto text-xs px-3 py-1 rounded-full border bg-white hover:bg-gray-50 transition-colors"
            >
              {allExpanded ? '모두 접기' : '모두 펼치기'}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 p-4 overflow-auto">
        {questions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p className="text-4xl mb-3">📊</p>
            <p>등록된 퀴즈 문제가 없습니다.</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-3">
            {questions.map((question) => {
              const expanded = expandedIds.has(question.id)
              const isOx = question.question_type === 'ox'

              return (
                <div
                  key={question.id}
                  className="rounded-lg border bg-white shadow-sm overflow-hidden"
                >
                  {/* 접힌 상태: 정답률 요약만 */}
                  <button
                    onClick={() => toggleExpanded(question.id)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-sm font-bold text-slate-400 shrink-0 mt-0.5">
                        #{question.order_num}
                      </span>
                      <span className="flex-1 text-sm text-slate-700 leading-snug whitespace-pre-wrap">
                        {question.question_text}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div
                            className={`text-sm font-bold ${accuracyColor(
                              question.accuracy
                            )}`}
                          >
                            정답률 {question.accuracy}%
                          </div>
                          <div className="text-xs text-slate-400">
                            응답 {question.total_answers}/{participantCount}
                          </div>
                        </div>
                        <span className="text-slate-400 text-xs">
                          {expanded ? '▲' : '▼'}
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* 펼친 상태: 선택지별 분포 + 누가 골랐는지 */}
                  {expanded && (
                    <div className="border-t bg-slate-50/50 px-4 py-3">
                      <div className="flex flex-wrap gap-4 text-xs text-slate-500 mb-3">
                        <span>
                          정답{' '}
                          <strong className="text-green-600">
                            {question.correct_count}명
                          </strong>
                        </span>
                        <span>
                          오답{' '}
                          <strong className="text-red-600">
                            {question.incorrect_count}명
                          </strong>
                        </span>
                        {question.unanswered_count > 0 && (
                          <span>
                            미응답{' '}
                            <strong className="text-slate-500">
                              {question.unanswered_count}명
                            </strong>
                          </span>
                        )}
                        {question.average_time_ms > 0 && (
                          <span>
                            평균 응답{' '}
                            <strong className="text-slate-600">
                              {(question.average_time_ms / 1000).toFixed(1)}초
                            </strong>
                          </span>
                        )}
                      </div>

                      <div className="space-y-2">
                        {question.distribution.map((bucket, index) => (
                          <div key={`${bucket.number ?? 'etc'}-${index}`}>
                            <div className="flex items-center gap-2 text-sm">
                              <span
                                className={`shrink-0 w-10 text-right text-xs font-medium ${
                                  bucket.is_correct
                                    ? 'text-green-600'
                                    : 'text-slate-400'
                                }`}
                              >
                                {isOx || bucket.number === null
                                  ? ''
                                  : `${bucket.number}번`}
                              </span>
                              <span
                                className={`flex-1 truncate ${
                                  bucket.is_correct
                                    ? 'text-green-700 font-medium'
                                    : 'text-slate-600'
                                }`}
                                title={bucket.text}
                              >
                                {bucket.text || '(빈 답변)'}
                                {bucket.is_correct && (
                                  <span className="ml-1 text-xs">✓ 정답</span>
                                )}
                                {bucket.number === null && (
                                  <span className="ml-1 text-xs text-amber-600">
                                    (현재 선택지에 없는 답변)
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 text-xs text-slate-500 w-24 text-right">
                                {bucket.count}명 ({bucket.percent}%)
                              </span>
                            </div>

                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="shrink-0 w-10" />
                              <div className="flex-1 h-2 rounded bg-slate-200 overflow-hidden">
                                <div
                                  className={`h-full rounded ${
                                    bucket.is_correct
                                      ? 'bg-green-500'
                                      : 'bg-slate-400'
                                  }`}
                                  style={{ width: `${bucket.percent}%` }}
                                />
                              </div>
                              <span className="shrink-0 w-24" />
                            </div>

                            {bucket.nicknames.length > 0 && (() => {
                              const rosterKey = `${question.id}:${index}`
                              const rosterVisible = visibleRosters.has(rosterKey)

                              return (
                                <div className="flex gap-2 mt-1">
                                  <span className="shrink-0 w-10" />
                                  <div className="flex-1">
                                    <button
                                      onClick={() => toggleRoster(rosterKey)}
                                      className="text-xs text-slate-400 hover:text-blue-600 transition-colors"
                                    >
                                      {rosterVisible
                                        ? '명단 숨기기 ▲'
                                        : `명단 보기 (${bucket.nicknames.length}명) ▼`}
                                    </button>
                                    {rosterVisible && (
                                      <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                                        {bucket.nicknames.join(', ')}
                                      </p>
                                    )}
                                  </div>
                                  <span className="shrink-0 w-24" />
                                </div>
                              )
                            })()}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
