# 로그 히스토리

> 이 문서는 디버깅을 위해 추가된 로그들을 추적합니다.
> 프로덕션 배포 전 이 문서를 참고하여 로그를 일괄 삭제하세요.

## 로그 삭제 방법

### 방법 1: 검색으로 찾기
프로젝트 전체에서 다음 패턴을 검색하여 삭제:
- `console.log('[Register]`
- `console.error('[Register]`

### 방법 2: 파일별 삭제
아래 파일 목록을 참고하여 해당 라인 삭제

---

## 로그가 추가된 파일 목록

### 1. src/app/(auth)/register/page.tsx

**추가일**: 2024-11-28
**목적**: 강사 회원가입 프로세스 디버깅

| 라인 | 로그 타입 | 로그 내용 |
|------|----------|----------|
| 30 | console.log | `[Register] 회원가입 시작` - 이메일, 이름 출력 |
| 33 | console.log | `[Register] 비밀번호 불일치` |
| 39 | console.log | `[Register] 비밀번호 길이 부족` |
| 47 | console.log | `[Register] Supabase 클라이언트 생성` |
| 51 | console.log | `[Register] Supabase Auth signUp 호출` |
| 57 | console.log | `[Register] signUp 결과` - authData, authError 출력 |
| 60 | console.error | `[Register] Auth 에러` - authError 출력 |
| 66 | console.error | `[Register] 사용자 데이터 없음` |
| 71 | console.log | `[Register] 사용자 생성 성공, ID` - user.id 출력 |
| 74 | console.log | `[Register] instructor_profiles 테이블에 insert 시작` |
| 83 | console.log | `[Register] 프로필 데이터` - profileData 출력 |
| 90 | console.log | `[Register] insert 결과` - insertedProfile, profileError 출력 |
| 93 | console.error | `[Register] 프로필 생성 에러` - profileError 출력 |
| 98 | console.log | `[Register] 회원가입 완료!` |
| 102 | console.error | `[Register] 예외 발생` - error 출력 |

**삭제할 코드 패턴**:
```javascript
console.log('[Register]', ...)
console.error('[Register]', ...)
```

---

## 로그 프리픽스 규칙

| 프리픽스 | 설명 |
|---------|------|
| `[Register]` | 강사 회원가입 관련 |
| `[Login]` | 로그인 관련 (예정) |
| `[Admin]` | 관리자 기능 관련 (예정) |
| `[Game]` | 게임 관련 (예정) |
| `[API]` | API 라우트 관련 (예정) |

---

## 변경 이력

| 날짜 | 작업 | 파일 | 비고 |
|------|------|------|------|
| 2024-11-28 | 로그 추가 | register/page.tsx | 회원가입 디버깅용 |
