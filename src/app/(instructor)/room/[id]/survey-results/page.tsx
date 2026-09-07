'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/utils/api'

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

interface RoomInfo {
  room_code: string
  room_name: string
  status: string
}

// 문항별 응답 분포의 한 항목. number 는 선택지 번호이며,
// 주관식이거나 선택지 목록에 없는 답변이면 null.
interface AnswerBucket {
  number: number | null
  text: string
  count: number
  percent: number
}

type SortKey = 'nickname' | string // 'nickname' 또는 question id
type SortDir = 'asc' | 'desc' | null

export default function SurveyResultsPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()

  const [questions, setQuestions] = useState<SurveyQuestion[]>([])
  const [rows, setRows] = useState<SurveyResultRow[]>([])
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [viewMode, setViewMode] = useState<'stats' | 'table'>('stats')
  const [nicknameQuery, setNicknameQuery] = useState('')

  const fetchResults = useCallback(async () => {
    try {
      const [resultsRes, roomRes] = await Promise.all([
        apiFetch(`/api/games/survey/results?room_id=${id}`),
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

      if (resultsRes.ok) {
        const data = await resultsRes.json()
        setQuestions(data.questions || [])
        setRows(data.rows || [])
        setLastUpdated(new Date())
      }
    } catch (error) {
      console.error('결과 조회 오류:', error)
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    fetchResults()
  }, [fetchResults])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchResults, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchResults])

  const handleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else if (sortDir === 'desc') {
      setSortKey(null)
      setSortDir(null)
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey || !sortDir) return rows
    return [...rows].sort((a, b) => {
      const valA = sortKey === 'nickname' ? a.nickname : (a.answers[sortKey] || '')
      const valB = sortKey === 'nickname' ? b.nickname : (b.answers[sortKey] || '')
      const cmp = valA.localeCompare(valB, 'ko')
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortKey, sortDir])

  // 이름 일부만 입력해도 걸리도록 부분 일치로 거른다 ("태" → "김태균")
  const displayRows = useMemo(() => {
    const query = nicknameQuery.trim().toLowerCase()
    if (!query) return sortedRows
    return sortedRows.filter((row) => row.nickname.toLowerCase().includes(query))
  }, [sortedRows, nicknameQuery])

  const SortIcon = ({ colKey }: { colKey: SortKey }) => {
    if (sortKey !== colKey) {
      return <span className="ml-1 text-slate-300 text-xs">⇅</span>
    }
    return (
      <span className="ml-1 text-blue-500 text-xs">
        {sortDir === 'asc' ? '↑' : '↓'}
      </span>
    )
  }

  /**
   * 문항별 응답 분포. 이미 받아온 rows 로 계산하므로 추가 API 호출이 없다.
   * 선택형은 선택지 순서를 유지해 문항끼리 비교하기 쉽게 하고,
   * 주관식은 같은 답변을 묶어 많이 나온 순으로 정렬한다.
   */
  const questionStats = useMemo(() => {
    return questions.map((question) => {
      const given = rows
        .map((row) => (row.answers[question.id] || '').trim())
        .filter((answer) => answer !== '')

      const total = given.length
      const counts = new Map<string, number>()
      for (const answer of given) {
        counts.set(answer, (counts.get(answer) || 0) + 1)
      }

      const percentOf = (count: number) =>
        total > 0 ? Math.round((count / total) * 100) : 0

      if (question.question_type === 'short_answer') {
        const buckets = [...counts.entries()]
          .map(([text, count]) => ({ number: null, text, count, percent: percentOf(count) }))
          .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'ko'))
        return { question, total, buckets, isChoice: false }
      }

      const optionList = Array.isArray(question.options) ? question.options.map(String) : []
      const buckets: AnswerBucket[] = optionList.map((option, index) => {
        const text = option.trim()
        const count = counts.get(text) || 0
        counts.delete(text)
        return { number: index + 1, text, count, percent: percentOf(count) }
      })

      // 선택지 목록에 없는 답변(문항 수정 전에 들어온 값 등)은 뒤에 따로 붙인다
      for (const [text, count] of counts) {
        buckets.push({ number: null, text, count, percent: percentOf(count) })
      }

      return { question, total, buckets, isChoice: true }
    })
  }, [questions, rows])

  const answeredCount = (questionId: string) =>
    rows.filter((r) => r.answers[questionId] && r.answers[questionId] !== '').length

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* 헤더 */}
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
                {room?.room_name || '설문 결과'}
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
            {/* 통계(집계) / 표(개인별) 전환 */}
            <div className="flex rounded-full border overflow-hidden text-xs">
              <button
                onClick={() => setViewMode('stats')}
                className={`px-3 py-1.5 transition-colors ${
                  viewMode === 'stats'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white hover:bg-gray-50'
                }`}
              >
                통계
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 transition-colors ${
                  viewMode === 'table'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white hover:bg-gray-50'
                }`}
              >
                응답표
              </button>
            </div>
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
              onClick={fetchResults}
              className="text-xs px-3 py-1.5 rounded-full border bg-white hover:bg-gray-50 transition-colors"
            >
              새로고침
            </button>
          </div>
        </div>

        {/* 요약 통계 */}
        <div className="px-4 pb-2 flex gap-4 text-sm">
          <span className="text-muted-foreground">
            참가자 <strong className="text-foreground">{rows.length}명</strong>
          </span>
          <span className="text-muted-foreground">
            문항 <strong className="text-foreground">{questions.length}개</strong>
          </span>
          {sortKey && (
            <span className="text-blue-600 text-xs flex items-center gap-1">
              정렬 중: {sortKey === 'nickname' ? '참가자명' : `Q${questions.find(q => q.id === sortKey)?.order_num}`}
              {sortDir === 'asc' ? ' ↑' : ' ↓'}
              <button onClick={() => { setSortKey(null); setSortDir(null) }} className="ml-1 text-slate-400 hover:text-slate-600">✕</button>
            </span>
          )}
        </div>
      </header>

      {/* 본문 */}
      <main className="flex-1 p-4 overflow-auto">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p className="text-4xl mb-3">📋</p>
            <p>아직 답변이 없습니다.</p>
          </div>
        ) : viewMode === 'stats' ? (
          <div className="max-w-3xl mx-auto space-y-4">
            {questionStats.map(({ question, total, buckets, isChoice }) => {
              const topCount = buckets.reduce((max, b) => Math.max(max, b.count), 0)

              return (
                <div
                  key={question.id}
                  className="rounded-lg border bg-white shadow-sm p-4"
                >
                  <div className="flex items-start gap-2 mb-3">
                    <span className="text-xs font-bold text-blue-600 shrink-0 mt-0.5">
                      Q{question.order_num}
                    </span>
                    <p className="flex-1 text-sm font-medium leading-snug">
                      {question.question_text}
                    </p>
                    <span className="text-xs text-slate-400 shrink-0">
                      {question.question_type === 'short_answer'
                        ? '주관식'
                        : question.question_type === 'choice_2'
                        ? '2지선다'
                        : '4지선다'}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground mb-3">
                    응답 {total}명 / 참가자 {rows.length}명
                    {isChoice || buckets.length === 0
                      ? ''
                      : ` · 서로 다른 답변 ${buckets.length}종`}
                  </p>

                  {total === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-3">
                      아직 응답이 없습니다
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {buckets.map((bucket, index) => {
                        // 가장 많이 선택된 항목을 진하게 (동률이면 함께 강조)
                        const isTop = bucket.count > 0 && bucket.count === topCount

                        return (
                          <div key={`${bucket.number ?? 'etc'}-${index}`}>
                            <div className="flex items-center gap-2 text-sm">
                              {bucket.number !== null && (
                                <span className="shrink-0 w-8 text-right text-xs font-medium text-slate-400">
                                  {bucket.number}번
                                </span>
                              )}
                              <span
                                className={`flex-1 truncate ${
                                  isTop ? 'font-bold text-slate-800' : 'text-slate-600'
                                }`}
                                title={bucket.text}
                              >
                                {bucket.text}
                                {bucket.number === null && isChoice && (
                                  <span className="ml-1 text-xs text-amber-600">
                                    (현재 선택지에 없는 답변)
                                  </span>
                                )}
                              </span>
                              <span
                                className={`shrink-0 text-xs w-20 text-right ${
                                  isTop ? 'font-bold text-blue-700' : 'text-slate-500'
                                }`}
                              >
                                {bucket.count}명 ({bucket.percent}%)
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {bucket.number !== null && <span className="shrink-0 w-8" />}
                              <div className="flex-1 h-2.5 rounded bg-slate-100 overflow-hidden">
                                <div
                                  className={`h-full rounded ${
                                    isTop ? 'bg-blue-600' : 'bg-slate-300'
                                  }`}
                                  style={{ width: `${bucket.percent}%` }}
                                />
                              </div>
                              <span className="shrink-0 w-20" />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="text-sm w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {/* 고정 열: 참가자 */}
                    <th className="border border-slate-200 px-4 py-3 text-left font-semibold sticky left-0 bg-slate-50 z-10 whitespace-nowrap min-w-[150px]">
                      <button
                        onClick={() => handleSort('nickname')}
                        className="flex items-center gap-0.5 hover:text-blue-600 transition-colors"
                      >
                        참가자
                        <SortIcon colKey="nickname" />
                      </button>

                      {/* 이름 검색 — 입력할 때마다 아래 목록이 즉시 걸러진다 */}
                      <div className="relative mt-1.5">
                        <input
                          type="text"
                          value={nicknameQuery}
                          onChange={(e) => setNicknameQuery(e.target.value)}
                          placeholder="이름 검색"
                          className="w-full text-xs font-normal border rounded px-2 py-1 pr-6 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        {nicknameQuery && (
                          <button
                            onClick={() => setNicknameQuery('')}
                            className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs px-1"
                            title="검색어 지우기"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      {nicknameQuery && (
                        <p className="mt-1 text-xs font-normal text-blue-600">
                          {displayRows.length}명 검색됨
                        </p>
                      )}
                    </th>
                    {questions.map((q) => (
                      <th
                        key={q.id}
                        className="border border-slate-200 px-4 py-3 text-left font-medium min-w-[160px] max-w-[240px]"
                      >
                        <button
                          onClick={() => handleSort(q.id)}
                          className="w-full text-left hover:text-blue-600 transition-colors group"
                        >
                          <div className="flex items-center gap-0.5 text-xs text-blue-600 font-semibold mb-0.5 group-hover:text-blue-700">
                            Q{q.order_num}
                            <span className="ml-1 font-normal text-slate-400">
                              ({q.question_type === 'short_answer' ? '단답' : `${q.question_type === 'choice_2' ? '2' : '4'}지선다`})
                            </span>
                            <SortIcon colKey={q.id} />
                          </div>
                          <div className="text-slate-700 text-xs leading-snug">
                            {q.question_text}
                          </div>
                        </button>
                        <div className="text-xs text-slate-400 mt-1">
                          응답 {answeredCount(q.id)}/{rows.length}명
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={questions.length + 1}
                        className="border border-slate-200 px-4 py-8 text-center text-slate-400"
                      >
                        &quot;{nicknameQuery}&quot; 와 일치하는 참가자가 없습니다
                      </td>
                    </tr>
                  )}
                  {displayRows.map((row, idx) => (
                    <tr
                      key={row.participant_id}
                      className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                    >
                      {/* 고정 열: 닉네임 */}
                      <td className={`border border-slate-200 px-4 py-3 font-semibold sticky left-0 z-10 whitespace-nowrap ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                        {row.nickname}
                      </td>
                      {questions.map((q) => (
                        <td
                          key={q.id}
                          className="border border-slate-200 px-4 py-3 text-slate-600 align-top"
                        >
                          {row.answers[q.id] ? (
                            <span>{row.answers[q.id]}</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
