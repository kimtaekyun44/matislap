'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'

export default function Home() {
  const router = useRouter()
  const [roomCode, setRoomCode] = useState('')
  const [loading, setLoading] = useState(false)

  const handleQuickJoin = async (e: React.FormEvent) => {
    e.preventDefault()

    const code = roomCode.trim().toUpperCase()
    if (!code) {
      toast.error('방 코드를 입력해주세요.')
      return
    }

    if (code.length < 6) {
      toast.error('방 코드는 6자리입니다.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`/api/games/join?code=${code}`)

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || '존재하지 않는 방 코드입니다.')
        return
      }

      router.push(`/join/${code}`)
    } catch {
      toast.error('서버 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
      <div className="container mx-auto px-4">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            MetisLap
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mb-8">
            실시간 미니게임 플랫폼
          </p>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-sm mx-auto">
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              방 코드를 입력하세요
            </p>
            <form onSubmit={handleQuickJoin} className="space-y-4">
              <input
                type="text"
                placeholder="ABC123"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white text-center text-xl font-mono uppercase tracking-widest"
                maxLength={6}
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '확인 중...' : '참여하기'}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <Link
                href="/login"
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                강사 로그인
              </Link>
            </div>
          </div>

          <div className="mt-8">
            <Link
              href="/admin/login"
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              관리자
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
