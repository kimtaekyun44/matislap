# 📁 MetisLap 프로젝트 구조 가이드

## 🎯 디렉토리 구조와 역할

```
metislap/
├── src/                        # 소스 코드 루트
│   ├── app/                   # Next.js App Router (페이지와 API)
│   ├── components/            # React 컴포넌트
│   ├── lib/                   # 핵심 비즈니스 로직
│   ├── hooks/                 # Custom React Hooks
│   ├── types/                 # TypeScript 타입 정의
│   ├── stores/                # Zustand 상태 관리
│   ├── utils/                 # 유틸리티 함수
│   └── constants/             # 상수 정의
├── public/                    # 정적 파일
├── .env.local                # 환경 변수 (Git 제외)
└── package.json              # 프로젝트 설정
```

## 📂 상세 디렉토리 설명

### `/src/app` - Next.js App Router
라우팅과 API 엔드포인트를 담당하는 핵심 디렉토리

```
app/
├── (auth)/                    # 인증 관련 페이지 그룹
│   ├── login/page.tsx        # 강사 로그인
│   ├── register/page.tsx     # 강사 회원가입
│   └── pending/page.tsx      # 승인 대기 안내
├── (instructor)/             # 강사 전용 페이지 (인증 필요)
│   ├── dashboard/            # 강사 대시보드
│   └── room/[id]/           # 방 관리 페이지
├── admin/                    # 관리자 영역
│   ├── login/               # 관리자 로그인 (별도 인증)
│   └── (authenticated)/     # 관리자 전용 (인증 필요)
│       ├── dashboard/       # 관리자 대시보드
│       └── instructors/     # 강사 관리
├── games/                    # 게임 관련 페이지
│   ├── [gameId]/           # 개별 게임 페이지
│   └── room/[code]/        # 게임 방 페이지
├── api/                     # API Routes
│   ├── auth/               # 인증 API
│   │   ├── instructor/     # 강사 인증
│   │   └── admin/         # 관리자 인증
│   ├── games/             # 게임 API
│   └── rooms/             # 방 관리 API
├── layout.tsx              # 루트 레이아웃
└── page.tsx               # 메인 페이지
```

### `/src/components` - React 컴포넌트
재사용 가능한 UI 컴포넌트

```
components/
├── auth/                   # 인증 관련 컴포넌트
│   ├── LoginForm.tsx      # 로그인 폼
│   ├── RegisterForm.tsx   # 회원가입 폼
│   └── AuthGuard.tsx      # 인증 체크 래퍼
├── games/                  # 게임 컴포넌트
│   ├── GameLobby.tsx      # 게임 대기실
│   ├── GameBoard.tsx      # 게임 보드
│   ├── quiz/              # 퀴즈 게임 컴포넌트
│   ├── drawing/           # 그림 그리기 게임
│   └── word-chain/        # 단어 체인 게임
├── admin/                  # 관리자 컴포넌트
│   ├── InstructorTable.tsx  # 강사 목록 테이블
│   └── ApprovalModal.tsx    # 승인 모달
├── ui/                     # 기본 UI 컴포넌트 (shadcn/ui)
│   ├── button.tsx         # 버튼
│   ├── card.tsx          # 카드
│   ├── dialog.tsx        # 다이얼로그
│   └── ...
└── layout/                # 레이아웃 컴포넌트
    ├── Header.tsx        # 헤더
    ├── Sidebar.tsx       # 사이드바
    └── Footer.tsx        # 푸터
```

### `/src/lib` - 핵심 비즈니스 로직
애플리케이션의 핵심 기능 구현

```
lib/
├── supabase/              # Supabase 클라이언트 설정
│   ├── client.ts         # 브라우저 클라이언트
│   ├── server.ts         # 서버 클라이언트
│   └── admin.ts          # 관리자 클라이언트 (Service Role)
├── auth/                  # 인증 로직
│   ├── instructor.ts     # 강사 인증 로직
│   ├── admin.ts          # 관리자 인증 로직
│   └── middleware.ts     # 인증 미들웨어
└── games/                 # 게임 로직
    ├── engine.ts         # 게임 엔진 코어
    ├── quiz.ts          # 퀴즈 게임 로직
    ├── drawing.ts       # 그림 그리기 로직
    └── realtime.ts      # 실시간 통신 로직
```

### `/src/hooks` - Custom React Hooks
재사용 가능한 React 훅

```
hooks/
├── useAuth.ts            # 인증 상태 관리
├── useSupabase.ts        # Supabase 클라이언트 접근
├── useRealtime.ts        # 실시간 구독 관리
├── useGame.ts           # 게임 상태 관리
└── useToast.ts          # 토스트 알림
```

### `/src/types` - TypeScript 타입 정의
프로젝트 전체 타입 정의

```
types/
├── index.ts             # 메인 타입 정의
├── supabase.ts          # Supabase 자동 생성 타입
├── game.types.ts        # 게임 관련 타입
└── api.types.ts         # API 요청/응답 타입
```

### `/src/stores` - Zustand 상태 관리
전역 상태 관리 스토어

```
stores/
├── authStore.ts         # 인증 상태 스토어
├── gameStore.ts         # 게임 상태 스토어
├── uiStore.ts          # UI 상태 스토어
└── index.ts            # 스토어 통합 export
```

### `/src/utils` - 유틸리티 함수
공통 유틸리티 함수

```
utils/
├── cn.ts               # className 병합 유틸
├── format.ts           # 포맷팅 함수
├── validation.ts       # 유효성 검사
├── crypto.ts          # 암호화 관련
└── constants.ts       # 상수 정의
```

## 🔑 주요 파일 설명

### 환경 설정 파일
- `.env.local` - 실제 환경 변수 (Git 제외)
- `.env.example` - 환경 변수 템플릿
- `next.config.js` - Next.js 설정
- `tailwind.config.js` - Tailwind CSS 설정
- `tsconfig.json` - TypeScript 설정

### 데이터베이스
- `database-schema.sql` - Supabase 데이터베이스 스키마
- `supabase/migrations/` - 데이터베이스 마이그레이션
- `supabase/seed.sql` - 초기 데이터

## 🎮 게임별 구조

### 퀴즈 게임
```
components/games/quiz/
├── QuizBoard.tsx        # 퀴즈 보드
├── QuizQuestion.tsx     # 질문 컴포넌트
├── QuizAnswer.tsx       # 답변 컴포넌트
└── QuizResult.tsx       # 결과 화면
```

### 그림 그리기 게임
```
components/games/drawing/
├── DrawingCanvas.tsx    # 그리기 캔버스
├── DrawingTools.tsx     # 그리기 도구
├── GuessingPanel.tsx    # 추측 패널
└── DrawingResult.tsx    # 결과 화면
```

## 📝 네이밍 규칙

### 파일명
- **컴포넌트**: PascalCase (예: `LoginForm.tsx`)
- **유틸리티**: camelCase (예: `formatDate.ts`)
- **타입**: kebab-case + .types.ts (예: `game.types.ts`)
- **스토어**: camelCase + Store (예: `authStore.ts`)

### 변수/함수명
- **변수**: camelCase (예: `userName`)
- **상수**: UPPER_SNAKE_CASE (예: `MAX_PARTICIPANTS`)
- **타입/인터페이스**: PascalCase (예: `GameRoom`)
- **Enum**: PascalCase (예: `RoomStatus`)

## 🔄 데이터 흐름

```
User Action → Component → Hook → Store/API → Supabase → Response → Store → Component Update
```

1. 사용자가 컴포넌트에서 액션 수행
2. 컴포넌트가 Hook 호출
3. Hook이 Store 업데이트 또는 API 호출
4. API가 Supabase와 통신
5. 응답을 Store에 저장
6. 컴포넌트가 Store 변경 감지하여 UI 업데이트

## 🚀 개발 시작하기

1. **환경 변수 설정**
   ```bash
   cp .env.example .env.local
   # .env.local 파일 열어서 Supabase 키 입력
   ```

2. **패키지 설치**
   ```bash
   npm install
   ```

3. **데이터베이스 설정**
   ```bash
   # Supabase 대시보드에서 SQL 실행
   # database-schema.sql 내용 복사하여 실행
   ```

4. **개발 서버 실행**
   ```bash
   npm run dev
   ```

## 📌 중요 파일 위치

- **메인 페이지**: `/src/app/page.tsx`
- **강사 로그인**: `/src/app/(auth)/login/page.tsx`
- **관리자 로그인**: `/src/app/admin/login/page.tsx`
- **게임 방**: `/src/app/games/room/[code]/page.tsx`
- **Supabase 클라이언트**: `/src/lib/supabase/client.ts`
- **인증 미들웨어**: `/src/middleware.ts`

이 구조를 따라 개발하면 일관성 있고 유지보수가 쉬운 프로젝트를 만들 수 있습니다!
