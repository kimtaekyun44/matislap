#!/bin/bash

# 🎮 MetisLap 프로젝트 초기 설정 스크립트
# 이 스크립트는 Next.js 프로젝트를 생성하고 필요한 모든 설정을 자동으로 수행합니다.

echo "🚀 MetisLap 프로젝트 설정을 시작합니다..."

# 1. Next.js 프로젝트 생성
echo "📦 Next.js 프로젝트 생성 중..."
npx create-next-app@latest metislap \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --eslint

# 프로젝트 디렉토리로 이동
cd metislap

# 2. Git 설정
echo "🔧 Git 설정 중..."
rm -rf .git
git init
git remote add origin https://github.com/kimtaekyun44/matislap.git

# 3. 필수 패키지 설치
echo "📚 필수 패키지 설치 중..."

# Supabase
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs @supabase/ssr

# 인증 관련
npm install bcryptjs jsonwebtoken cookies-next
npm install -D @types/bcryptjs @types/jsonwebtoken

# UI 컴포넌트
npx shadcn-ui@latest init -y

# 상태 관리 및 유틸리티
npm install zustand nanoid clsx tailwind-merge
npm install react-hot-toast
npm install date-fns

# 개발 도구
npm install -D @types/node

# 4. 프로젝트 구조 생성
echo "📁 프로젝트 구조 생성 중..."

# 디렉토리 생성
mkdir -p src/app/\(auth\)/login
mkdir -p src/app/\(auth\)/register
mkdir -p src/app/\(auth\)/pending
mkdir -p src/app/\(instructor\)/dashboard
mkdir -p src/app/\(instructor\)/room
mkdir -p src/app/admin/login
mkdir -p src/app/admin/\(authenticated\)/dashboard
mkdir -p src/app/admin/\(authenticated\)/instructors
mkdir -p src/app/games
mkdir -p src/app/api/auth/instructor
mkdir -p src/app/api/auth/admin
mkdir -p src/app/api/games
mkdir -p src/app/api/rooms

mkdir -p src/components/auth
mkdir -p src/components/games
mkdir -p src/components/admin
mkdir -p src/components/ui
mkdir -p src/components/layout

mkdir -p src/lib/supabase
mkdir -p src/lib/auth
mkdir -p src/lib/games

mkdir -p src/hooks
mkdir -p src/types
mkdir -p src/utils
mkdir -p src/stores
mkdir -p src/constants

# 5. 환경 변수 파일 생성
echo "🔐 환경 변수 파일 생성 중..."

cat > .env.local << 'EOF'
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://cnfgyjkrwxncbkbpqnfw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_KEY=your-service-key-here

# Admin Auth
ADMIN_JWT_SECRET=your-very-secure-random-string-here-change-this
NEXTAUTH_SECRET=another-very-secure-random-string-here-change-this

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF

cat > .env.example << 'EOF'
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# Admin Auth
ADMIN_JWT_SECRET=
NEXTAUTH_SECRET=

# App
NEXT_PUBLIC_APP_URL=
EOF

# 6. gitignore 업데이트
echo "📝 .gitignore 업데이트 중..."
echo "
# env files
.env
.env.local
.env.production

# supabase
**/supabase/.branches
**/supabase/.temp
" >> .gitignore

echo "✅ 프로젝트 설정이 완료되었습니다!"
echo "📋 다음 단계:"
echo "1. .env.local 파일을 열어 Supabase 키를 입력하세요"
echo "2. npm run dev로 개발 서버를 실행하세요"
