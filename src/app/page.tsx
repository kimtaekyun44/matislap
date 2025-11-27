import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            🎮 MetisLap
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
            강의 시작 전 아이스브레이킹을 위한 실시간 미니게임 플랫폼
            <br />
            강사와 학생이 함께 즐기는 인터랙티브 게임!
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link
              href="/games"
              className="px-8 py-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-lg"
            >
              🎯 게임 참여하기
            </Link>
            <Link
              href="/login"
              className="px-8 py-4 bg-white text-blue-600 rounded-lg font-semibold hover:bg-gray-100 transition-colors shadow-lg border border-blue-200"
            >
              👨‍🏫 강사 로그인
            </Link>
          </div>

          {/* Quick Join */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md mx-auto">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              빠른 참여
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              강사에게 받은 방 코드를 입력하세요
            </p>
            <form className="space-y-4">
              <input
                type="text"
                placeholder="방 코드 입력 (예: ABC123)"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white text-center text-lg font-mono uppercase"
                maxLength={6}
              />
              <button
                type="submit"
                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
                참여하기 →
              </button>
            </form>
          </div>
        </div>

        {/* Features */}
        <div className="mt-24 grid md:grid-cols-3 gap-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
            <div className="text-4xl mb-4">🎯</div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              퀴즈 게임
            </h3>
            <p className="text-gray-600 dark:text-gray-300">
              객관식/주관식 퀴즈로 재미있게 학습 내용을 복습하세요
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
            <div className="text-4xl mb-4">🎨</div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              그림 그리기
            </h3>
            <p className="text-gray-600 dark:text-gray-300">
              제시어를 보고 그림을 그리고 다른 참가자가 맞추세요
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
            <div className="text-4xl mb-4">💬</div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              단어 연상
            </h3>
            <p className="text-gray-600 dark:text-gray-300">
              연관 단어를 맞추며 창의력을 발휘하세요
            </p>
          </div>
        </div>

        {/* Admin Link */}
        <div className="mt-16 text-center">
          <Link
            href="/admin/login"
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            관리자 로그인 →
          </Link>
        </div>
      </div>
    </main>
  )
}
