# 🎮 MetisLap - 아이스브레이킹 게임 플랫폼

## 📋 프로젝트 개요
강의 시작 전 아이스브레이킹을 위한 실시간 미니게임 플랫폼입니다.
강사가 게임 방을 생성하고, 학생들이 방 번호로 참여하여 함께 즐기는 웹 기반 플랫폼입니다.

## 🎯 핵심 기능
1. **이중 인증 체계**: 관리자(Master)와 강사(Instructor) 별도 인증
2. **실시간 게임**: Supabase Realtime을 활용한 즉각적인 상호작용
3. **간편한 참여**: 학생은 회원가입 없이 방 번호만으로 참여
4. **다양한 미니게임**: 퀴즈, 그림 그리기, 단어 게임 등

## 🛠 기술 스택
```json
{
  "framework": "Next.js 14 (App Router)",
  "language": "TypeScript",
  "database": "Supabase (PostgreSQL)",
  "auth": {
    "instructor": "Supabase Auth",
    "admin": "Custom JWT"
  },
  "realtime": "Supabase Realtime",
  "styling": "Tailwind CSS",
  "ui": "shadcn/ui",
  "state": "Zustand"
}
```

## 👥 사용자 역할

### Master (관리자)
- 시스템 전체 관리
- 강사 계정 승인/거부
- 게임 통계 및 로그 확인
- DB 직접 생성 (회원가입 없음)
- 첫 로그인 시 비밀번호 변경 필수

### Instructor (강사)
- 회원가입 → Master 승인 대기 → 활성화
- 게임 방 생성 및 관리
- 방 번호/URL 공유
- 실시간 게임 진행 제어

### Student (학생/참가자)
- 회원가입 불필요
- 강사가 공유한 URL 또는 방 번호로 접속
- 닉네임 입력 후 즉시 게임 참여
- 실시간 게임 플레이

## 📁 프로젝트 구조
```
metislap/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/            # 인증 관련 페이지
│   │   │   ├── login/         # 강사 로그인
│   │   │   ├── register/      # 강사 회원가입
│   │   │   └── pending/       # 승인 대기
│   │   ├── (instructor)/      # 강사 전용 페이지
│   │   │   ├── dashboard/     # 대시보드
│   │   │   └── room/[id]/     # 방 관리
│   │   ├── admin/             # 관리자 페이지
│   │   │   ├── login/         # 관리자 로그인
│   │   │   ├── dashboard/     # 관리자 대시보드
│   │   │   └── instructors/   # 강사 관리
│   │   ├── games/             # 게임 페이지
│   │   │   ├── [gameId]/      # 개별 게임
│   │   │   └── room/[code]/   # 게임 방
│   │   ├── api/               # API Routes
│   │   │   ├── auth/          # 인증 API
│   │   │   ├── admin/         # 관리자 API
│   │   │   └── games/         # 게임 API
│   │   └── page.tsx           # 메인 페이지
│   ├── components/            # React 컴포넌트
│   │   ├── auth/             # 인증 컴포넌트
│   │   ├── games/            # 게임 컴포넌트
│   │   ├── admin/            # 관리자 컴포넌트
│   │   └── ui/               # UI 컴포넌트
│   ├── lib/                  # 라이브러리 및 유틸
│   │   ├── supabase/         # Supabase 클라이언트
│   │   ├── auth/             # 인증 로직
│   │   └── games/            # 게임 로직
│   ├── hooks/                # Custom React Hooks
│   ├── types/                # TypeScript 타입 정의
│   └── utils/                # 헬퍼 함수
├── public/                    # 정적 파일
├── .env.local                # 환경 변수
└── package.json              # 프로젝트 설정
```

## 🚀 개발 순서

### Phase 1: 기초 설정 ✅
- [x] Next.js 프로젝트 생성
- [x] Supabase 프로젝트 연결
- [x] 기본 폴더 구조 설정
- [ ] 환경 변수 설정

### Phase 2: 데이터베이스 설계
- [ ] Supabase 테이블 스키마 생성
- [ ] RLS (Row Level Security) 정책 설정
- [ ] 초기 데이터 시딩

### Phase 3: 인증 시스템
- [ ] Supabase Auth 설정 (강사)
- [ ] Custom JWT 인증 (관리자)
- [ ] 인증 미들웨어 구현
- [ ] 회원가입/로그인 페이지

### Phase 4: 관리자 기능
- [ ] 관리자 대시보드
- [ ] 강사 승인 시스템
- [ ] 통계 및 로그 페이지

### Phase 5: 게임 방 시스템
- [ ] 방 생성/관리 API
- [ ] 실시간 연결 설정
- [ ] 방 참여 로직

### Phase 6: 미니게임 개발
- [ ] 게임 엔진 기본 구조
- [ ] 첫 번째 게임: 퀴즈
- [ ] 두 번째 게임: 그림 그리기
- [ ] 세 번째 게임: 단어 게임

### Phase 7: 배포
- [ ] Vercel 배포 설정
- [ ] 도메인 연결
- [ ] 모니터링 설정

## 🔧 주요 명령어
```bash
# 개발 서버 실행
npm run dev

# 빌드
npm run build

# Supabase 타입 생성
npm run generate-types

# 린트 검사
npm run lint
```

## 📝 환경 변수
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://cnfgyjkrwxncbkbpqnfw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# Admin Auth
ADMIN_JWT_SECRET=your-admin-jwt-secret
NEXTAUTH_SECRET=your-nextauth-secret

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 🎮 게임 목록 (예정)
1. **퀴즈 게임**: 객관식/주관식 질문
2. **그림 그리기**: 제시어를 보고 그림 그리기
3. **단어 연상**: 연관 단어 맞추기
4. **스피드 퀴즈**: 시간 제한 퀴즈
5. **투표 게임**: 실시간 투표 및 결과

## 📚 참고 자료
- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [shadcn/ui](https://ui.shadcn.com)
