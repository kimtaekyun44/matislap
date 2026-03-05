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
        ) : (
          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="text-sm w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {/* 고정 열: 참가자 */}
                    <th className="border border-slate-200 px-4 py-3 text-left font-semibold sticky left-0 bg-slate-50 z-10 whitespace-nowrap min-w-[100px]">
                      <button
                        onClick={() => handleSort('nickname')}
                        className="flex items-center gap-0.5 hover:text-blue-600 transition-colors"
                      >
                        참가자
                        <SortIcon colKey="nickname" />
                      </button>
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
                  {sortedRows.map((row, idx) => (
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
