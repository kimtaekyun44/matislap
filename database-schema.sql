-- ============================================================================
-- MetisLap 데이터베이스 스키마
-- ============================================================================
-- 기준일: 2026-08-13
-- 출처:   운영 Supabase 실물 DB에서 추출 (information_schema / pg_catalog)
-- 대상:   public 스키마 21개 테이블
--
-- ※ 개발과 운영이 같은 DB를 사용합니다. 이 파일은 "현재 상태의 기록"이며,
--    이 파일을 실행해서 운영 DB를 재생성하는 용도가 아닙니다.
--    (빈 DB에 처음부터 구축할 때만 위에서 아래로 순서대로 실행)
--
-- ※ 갱신 방법: 스키마를 변경했다면 이 파일도 함께 고쳐주세요.
--    변경 이력은 배포.md 의 "마이그레이션 이력" 표에도 남깁니다.
-- ============================================================================


-- ============================================================================
-- 0. 확장 (Extensions)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================================
-- 1. ENUM 타입
-- ============================================================================
CREATE TYPE user_role       AS ENUM ('master', 'instructor', 'student');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE room_status     AS ENUM ('waiting', 'in_progress', 'finished');

-- word_chain, speed_quiz, voting 은 정의만 되어 있고 실제 구현은 없음
CREATE TYPE game_type AS ENUM (
    'quiz', 'drawing', 'word_chain', 'speed_quiz', 'voting',
    'ladder', 'survey', 'jeopardy'
);


-- ============================================================================
-- 2. 공통 함수
-- ============================================================================

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 6자리 방 코드 생성 (중복되지 않을 때까지 반복)
CREATE OR REPLACE FUNCTION public.generate_room_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
    code TEXT;
    code_exists BOOLEAN;
BEGIN
    LOOP
        code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
        SELECT EXISTS(SELECT 1 FROM game_rooms WHERE room_code = code) INTO code_exists;
        IF NOT code_exists THEN
            RETURN code;
        END IF;
    END LOOP;
END;
$$;

-- 방 생성 시 room_code 자동 채움
CREATE OR REPLACE FUNCTION public.set_room_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.room_code IS NULL OR NEW.room_code = '' THEN
        NEW.room_code := generate_room_code();
    END IF;
    RETURN NEW;
END;
$$;


-- ============================================================================
-- 3. 인증 테이블
-- ============================================================================
-- 관리자와 강사 모두 Custom JWT 인증을 사용합니다 (Supabase Auth 미사용).
-- 비밀번호는 password_hash 컬럼에 bcrypt 해시로 저장됩니다.

-- 관리자 (회원가입 없음, DB에 직접 생성)
CREATE TABLE admin_users (
    id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    email                varchar(255) NOT NULL UNIQUE,
    password_hash        varchar(255) NOT NULL,
    name                 varchar(100) NOT NULL,
    must_change_password boolean      DEFAULT true,   -- 첫 로그인 시 변경 강제
    last_login           timestamptz,
    created_at           timestamptz  DEFAULT now(),
    updated_at           timestamptz  DEFAULT now()
);

-- 강사 (회원가입 → 관리자 승인 → 활성화)
CREATE TABLE instructor_users (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    email            varchar(255) NOT NULL UNIQUE,
    password_hash    varchar(255) NOT NULL,
    name             varchar(100) NOT NULL,
    organization     varchar(255),
    phone            varchar(20),
    approval_status  approval_status DEFAULT 'pending',
    approved_at      timestamptz,
    approved_by      uuid REFERENCES admin_users(id),
    rejection_reason text,
    last_login       timestamptz,
    created_at       timestamptz DEFAULT now(),
    updated_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_instructor_users_email           ON instructor_users (email);
CREATE INDEX idx_instructor_users_approval_status ON instructor_users (approval_status);

CREATE TRIGGER update_instructor_users_updated_at
    BEFORE UPDATE ON instructor_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================================
-- 4. 게임 공통 테이블
-- ============================================================================

-- 게임 방
-- current_* 컬럼은 게임 종류별 진행 상태를 담습니다 (하나의 방은 한 종류만 사용).
CREATE TABLE game_rooms (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_code        varchar(6) NOT NULL UNIQUE,   -- 트리거가 자동 생성
    instructor_id    uuid NOT NULL REFERENCES instructor_users(id) ON DELETE CASCADE,
    game_type        game_type NOT NULL,
    room_name        varchar(255) NOT NULL,
    max_participants integer     DEFAULT 30,
    status           room_status DEFAULT 'waiting',
    game_config      jsonb       DEFAULT '{}'::jsonb,
    started_at       timestamptz,
    ended_at         timestamptz,
    created_at       timestamptz DEFAULT now(),
    updated_at       timestamptz DEFAULT now(),

    -- 퀴즈: 현재 문제 순번
    current_question_index integer,
    -- 그림 그리기: 현재 라운드 순번
    current_round_index    integer,
    -- 제퍼디: 현재 문제 / 버저 선점자 / 선점자가 제출한 답
    --   ※ jeopardy_buzzer_answer 는 현재 문제의 답만 임시 보관하며 다음 문제에서 덮어씀
    current_jeopardy_question_id uuid,
    jeopardy_buzzer_winner_id    uuid,
    jeopardy_buzzer_answer       text
);
-- current_jeopardy_question_id, jeopardy_buzzer_winner_id 의 FK 는
-- 참조 대상 테이블이 아래에서 생성되므로 파일 끝에서 ALTER 로 추가합니다.

CREATE INDEX idx_game_rooms_instructor_id ON game_rooms (instructor_id);
CREATE INDEX idx_game_rooms_room_code     ON game_rooms (room_code);
CREATE INDEX idx_game_rooms_status        ON game_rooms (status);

CREATE TRIGGER set_room_code_trigger
    BEFORE INSERT ON game_rooms
    FOR EACH ROW EXECUTE FUNCTION set_room_code();

CREATE TRIGGER update_game_rooms_updated_at
    BEFORE UPDATE ON game_rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- 참가자 (회원가입 없이 닉네임만으로 참여)
CREATE TABLE game_participants (
    id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id       uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    nickname      varchar(50) NOT NULL,
    avatar_url    text,
    connection_id text,
    is_active     boolean     DEFAULT true,
    score         integer     DEFAULT 0,
    joined_at     timestamptz DEFAULT now(),
    left_at       timestamptz,

    UNIQUE (room_id, nickname)   -- 같은 방에서 닉네임 중복 불가
);

CREATE INDEX idx_game_participants_room_id ON game_participants (room_id);


-- 게임 세션 / 액션 로그 (초기 설계에만 존재하며 현재 코드에서 사용하지 않음)
CREATE TABLE game_sessions (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id          uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    game_type        game_type NOT NULL,
    game_data        jsonb   DEFAULT '{}'::jsonb,
    results          jsonb   DEFAULT '{}'::jsonb,
    duration_seconds integer,
    created_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_game_sessions_room_id ON game_sessions (room_id);

CREATE TABLE game_actions (
    id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id     uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    participant_id uuid REFERENCES game_participants(id) ON DELETE SET NULL,
    action_type    varchar(50) NOT NULL,
    action_data    jsonb       DEFAULT '{}'::jsonb,
    created_at     timestamptz DEFAULT now()
);

CREATE INDEX idx_game_actions_session_id ON game_actions (session_id);


-- ============================================================================
-- 5. 퀴즈 게임
-- ============================================================================

CREATE TABLE quiz_questions (
    id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id        uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    question_text  text NOT NULL,
    -- 'multiple_choice' | 'ox'  (주관식 미지원)
    question_type  varchar(20) NOT NULL DEFAULT 'multiple_choice',
    options        jsonb,          -- 선택지 문자열 배열. O/X는 ['O','X']
    correct_answer text NOT NULL,  -- 선택지 "텍스트"를 그대로 저장 (인덱스 아님)
    -- [2026-09-07] NULL = 제한 없음. 기본값 30 을 제거해 "제한 없음"이 기본이 되게 함
    time_limit     integer,
    points         integer DEFAULT 100,
    -- 삭제해도 다시 매기지 않으므로 1,3,4 처럼 구멍이 생길 수 있다.
    -- 진행 순서는 이 번호를 직접 찍지 않고 "아직 답하지 않은 첫 문제"로 결정한다.
    order_num      integer NOT NULL,
    created_at     timestamptz DEFAULT now(),

    -- [2026-09-07] 문제에 첨부하는 이미지. Storage 'quiz-images' 버킷의 공개 URL.
    -- 이미지를 DB에 base64로 넣지 않는 이유: 문제 목록을 강사/학생이 반복 조회해
    -- 조회할 때마다 원본이 통째로 오간다.
    -- 방 복사 시 여러 문제가 같은 URL을 참조할 수 있으므로,
    -- 파일 삭제는 남은 참조가 없을 때만 수행한다 (src/lib/games/quiz-image.ts)
    image_url text
);

CREATE INDEX idx_quiz_questions_room_id ON quiz_questions (room_id);
CREATE INDEX idx_quiz_questions_order   ON quiz_questions (room_id, order_num);

CREATE TABLE quiz_answers (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id     uuid NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    participant_id  uuid NOT NULL REFERENCES game_participants(id) ON DELETE CASCADE,
    selected_answer text    NOT NULL,   -- 제출 시점의 선택지 텍스트
    is_correct      boolean NOT NULL,   -- 제출 시점에 채점된 결과
    answer_time_ms  integer,
    points_earned   integer DEFAULT 0,
    created_at      timestamptz DEFAULT now(),

    UNIQUE (question_id, participant_id)   -- 문제당 1회만 답변
);

CREATE INDEX idx_quiz_answers_question_id    ON quiz_answers (question_id);
CREATE INDEX idx_quiz_answers_participant_id ON quiz_answers (participant_id);

-- ⚠ 알려진 주의점
--   selected_answer / correct_answer 가 텍스트라서, 문제를 수정해 선택지 문구가
--   바뀌면 그 이전에 제출된 답변과 더 이상 문자열이 일치하지 않습니다.
--   (실제 사례: 선택지 끝에 공백이 추가되어 기존 답변 31건이 미매칭)
--   통계 화면은 src/lib/games/quiz-stats.ts 에서 앞뒤 공백을 정규화해 대응합니다.


-- ============================================================================
-- 6. 그림 그리기 게임
-- ============================================================================

CREATE TABLE drawing_words (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id    uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    word       text NOT NULL,
    hint       text,
    order_num  integer NOT NULL DEFAULT 1,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_drawing_words_room_id ON drawing_words (room_id);
CREATE INDEX idx_drawing_words_order   ON drawing_words (room_id, order_num);

CREATE TABLE drawing_rounds (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id      uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    word_id      uuid NOT NULL REFERENCES drawing_words(id) ON DELETE CASCADE,
    drawer_id    uuid NOT NULL REFERENCES game_participants(id) ON DELETE CASCADE,
    round_num    integer NOT NULL DEFAULT 1,
    status       varchar(20) DEFAULT 'waiting',
    drawing_data text,          -- 캔버스 이미지 (data URL)
    time_limit   integer DEFAULT 60,
    started_at   timestamptz,
    ended_at     timestamptz,
    created_at   timestamptz DEFAULT now()
);

CREATE INDEX idx_drawing_rounds_room_id ON drawing_rounds (room_id);
CREATE INDEX idx_drawing_rounds_status  ON drawing_rounds (status);

CREATE TABLE drawing_guesses (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id       uuid NOT NULL REFERENCES drawing_rounds(id) ON DELETE CASCADE,
    participant_id uuid NOT NULL REFERENCES game_participants(id) ON DELETE CASCADE,
    guess_text     text NOT NULL,
    is_correct     boolean DEFAULT false,
    points_earned  integer DEFAULT 0,   -- 맞춘 순서에 따라 차등 (1등 100, 2등 80…)
    guessed_at     timestamptz DEFAULT now(),

    UNIQUE (round_id, participant_id, guess_text)   -- 같은 답 반복 제출 방지
);

CREATE INDEX idx_drawing_guesses_round_id ON drawing_guesses (round_id);


-- ============================================================================
-- 7. 사다리 게임
-- ============================================================================

CREATE TABLE ladder_items (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id    uuid REFERENCES game_rooms(id) ON DELETE CASCADE,
    item_text  text NOT NULL,      -- 사다리 끝에 걸린 당첨/벌칙 내용
    position   integer NOT NULL,   -- 0부터 연속. 게임 시작 시 재정렬됨
    created_at timestamptz DEFAULT now(),

    -- [2026-08-13 추가] 참가자 수에 맞춰 자동 생성된 "다음 기회에" 항목 여부.
    -- 게임 시작 시 (참가자 수 - 당첨 항목 수)만큼 자동 생성되며,
    -- 재시작할 때 이 값이 true인 행만 지우고 강사가 등록한 항목은 보존한다.
    is_auto boolean NOT NULL DEFAULT false
);

CREATE TABLE ladder_data (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id          uuid UNIQUE REFERENCES game_rooms(id) ON DELETE CASCADE,
    lines_count      integer NOT NULL,
    horizontal_lines jsonb,          -- 가로줄 좌표 배열
    created_at       timestamptz DEFAULT now()
);

CREATE TABLE ladder_selections (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id         uuid REFERENCES game_rooms(id) ON DELETE CASCADE,
    participant_id  uuid REFERENCES game_participants(id) ON DELETE CASCADE,
    start_position  integer NOT NULL,
    result_position integer,
    is_revealed     boolean DEFAULT false,
    selected_at     timestamptz DEFAULT now(),

    UNIQUE (room_id, participant_id),   -- 1인 1회 선택
    UNIQUE (room_id, start_position)    -- 같은 출발점 중복 선택 불가
);


-- ============================================================================
-- 8. 설문조사
-- ============================================================================
-- 정답 개념이 없습니다. 결과는 /room/[id]/survey-results 에서 표로 확인합니다.

CREATE TABLE survey_questions (
    id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id       uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    question_text text NOT NULL,
    question_type varchar(20) NOT NULL
        CHECK (question_type IN ('short_answer', 'choice_2', 'choice_4')),
    options       jsonb,
    order_num     integer NOT NULL DEFAULT 1,
    created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_survey_questions_room ON survey_questions (room_id);

CREATE TABLE survey_answers (
    id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id    uuid NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
    participant_id uuid NOT NULL REFERENCES game_participants(id) ON DELETE CASCADE,
    answer_text    text NOT NULL,
    created_at     timestamptz DEFAULT now(),

    UNIQUE (question_id, participant_id)
);

CREATE INDEX idx_survey_answers_question    ON survey_answers (question_id);
CREATE INDEX idx_survey_answers_participant ON survey_answers (participant_id);


-- ============================================================================
-- 9. 제퍼디쇼
-- ============================================================================
-- 버저를 먼저 누른 1명만 답변하는 방식입니다.
-- 문제 유형 값이 한글('2지선다','4지선다')인 점에 주의하세요. 다른 게임과 규칙이 다릅니다.

CREATE TABLE jeopardy_questions (
    id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id       uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    category      varchar(100) NOT NULL,
    points        integer NOT NULL CHECK (points > 0),
    content       text NOT NULL,
    answer        text NOT NULL,
    is_used       boolean NOT NULL DEFAULT false,
    order_num     integer NOT NULL DEFAULT 1,
    created_at    timestamptz DEFAULT now(),
    question_type varchar(20) NOT NULL DEFAULT 'short_answer'
        CHECK (question_type IN ('short_answer', '2지선다', '4지선다')),
    options       jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX idx_jeopardy_questions_room_id       ON jeopardy_questions (room_id);
CREATE INDEX idx_jeopardy_questions_room_category ON jeopardy_questions (room_id, category);

CREATE TABLE jeopardy_buzzer_log (
    id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id        uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    question_id    uuid NOT NULL REFERENCES jeopardy_questions(id) ON DELETE CASCADE,
    participant_id uuid NOT NULL REFERENCES game_participants(id) ON DELETE CASCADE,
    is_correct     boolean,
    created_at     timestamptz DEFAULT now()
);

CREATE INDEX idx_jeopardy_buzzer_log_room_question
    ON jeopardy_buzzer_log (room_id, question_id);

-- ⚠ 알려진 주의점
--   참가자가 제출한 답 "내용"은 어디에도 영구 저장되지 않습니다.
--   버저 로그에는 정오답 여부(is_correct)만 남고, 답 텍스트는
--   game_rooms.jeopardy_buzzer_answer 에 임시로만 있다가 다음 문제에서 덮어써집니다.
--   → 주관식 오답 내용을 통계로 뽑으려면 이 테이블에 answer_text 컬럼 추가가 필요합니다.


-- ============================================================================
-- 10. 시스템
-- ============================================================================

CREATE TABLE system_logs (
    id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    uuid,
    user_type  user_role,
    action     varchar(100) NOT NULL,
    details    jsonb DEFAULT '{}'::jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_system_logs_created_at ON system_logs (created_at DESC);

-- Supabase 연결 확인용으로 만든 테스트 테이블. 사용처 없음 → 삭제 검토 대상
CREATE TABLE tb_test (
    id         serial PRIMARY KEY,
    title      text NOT NULL,
    content    text,
    created_at timestamptz DEFAULT now()
);


-- ============================================================================
-- 11. ★ 오늘 추가 (2026-08-13 작업분)
-- ============================================================================
-- 이 아래 내용이 오늘 새로 들어간 부분입니다.
-- 마이그레이션: 20260811033448_create_quiz_question_history
--
-- 배경: 게임 진행 중에도 퀴즈 문제를 수정할 수 있도록 바꾸면서,
--       누가 언제 무엇을 바꿨는지 추적할 필요가 생겼습니다.
--       특히 진행 중 수정은 이미 제출된 답변의 채점 결과와 어긋날 수 있어
--       변경 시점의 방 상태(room_status)를 함께 남깁니다.

CREATE TABLE quiz_question_history (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 문제가 삭제되어도 이력은 남아야 하므로 의도적으로 FK 를 걸지 않음
    question_id uuid NOT NULL,
    room_id     uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,

    -- 변경 시점의 강사 정보. 이름을 함께 저장해 조회 시 조인 불필요
    instructor_id   uuid,
    instructor_name varchar(100),

    action varchar(20) NOT NULL
        CHECK (action IN ('create', 'update', 'delete')),

    -- 변경 시점의 방 상태 ('waiting' | 'in_progress' | 'finished').
    -- 'in_progress' 인 이력은 화면에서 "게임 진행 중 변경" 배지로 강조됩니다.
    room_status varchar(20),
    order_num   integer,

    -- { 필드명: { before: ..., after: ... } } — 실제로 바뀐 필드만
    changed_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- 변경 후 전체 값 (delete 는 삭제 직전 값)
    snapshot       jsonb,

    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quiz_question_history_room
    ON quiz_question_history (room_id, created_at DESC);

CREATE INDEX idx_quiz_question_history_question
    ON quiz_question_history (question_id, created_at DESC);

-- 접근이 전부 service_role 키를 쓰는 API Route 경유이므로 정책 없이 RLS 만 활성화
ALTER TABLE quiz_question_history ENABLE ROW LEVEL SECURITY;

-- 참고: 같은 날 추가된 퀴즈 결과 통계 기능
--   (GET /api/games/quiz/stats, /room/[id]/quiz-results)
--   은 기존 quiz_answers 만으로 계산하므로 스키마 변경이 없습니다.


-- ---------------------------------------------------------------------------
-- 재진입 승인 요청  (migration: 20260813143146_create_rejoin_requests)
-- ---------------------------------------------------------------------------
-- 배경: 학생 인증 수단이 닉네임뿐이라, 이미 점수/선택 이력이 있는 참가자로
--       들어오려는 사람이 본인인지 확인할 방법이 없다.
--       그렇다고 막아버리면 새로고침으로 localStorage를 잃은 학생이
--       자기 점수와 자리를 두고 게임에서 배제된다.
--       그래서 강사가 판단하도록 승인 절차를 둔다.
--
-- 참고: 교실은 대부분 NAT라 전원이 같은 공인 IP로 잡힌다.
--       ip_address 는 본인 판별용이 아니라 사후 추적용 기록이다.

CREATE TABLE rejoin_requests (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id        uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    participant_id uuid NOT NULL REFERENCES game_participants(id) ON DELETE CASCADE,
    nickname       varchar(50) NOT NULL,

    status varchar(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),

    ip_address text,
    user_agent text,

    created_at  timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz
);

CREATE INDEX idx_rejoin_requests_room
    ON rejoin_requests (room_id, status, created_at DESC);

CREATE INDEX idx_rejoin_requests_participant
    ON rejoin_requests (participant_id, created_at DESC);

ALTER TABLE rejoin_requests ENABLE ROW LEVEL SECURITY;

-- 참고: game_participants.is_active 를 false 로 바꾸는 코드는 아직 없다.
--   퇴장 API가 없어서 모든 참가자가 계속 활성 상태로 남는다.
--   join API 의 "비활성 참가자 재활성화" 분기는 현재 실행되지 않는 경로다.


-- ============================================================================
-- 12. 순환 참조 FK (테이블 생성 후 추가)
-- ============================================================================
-- game_rooms 가 jeopardy_questions / game_participants 를 참조하는데
-- 그 두 테이블은 game_rooms 를 참조하므로 순환입니다. 마지막에 붙입니다.

ALTER TABLE game_rooms
    ADD CONSTRAINT game_rooms_current_jeopardy_question_id_fkey
    FOREIGN KEY (current_jeopardy_question_id)
    REFERENCES jeopardy_questions(id) ON DELETE SET NULL;

ALTER TABLE game_rooms
    ADD CONSTRAINT game_rooms_jeopardy_buzzer_winner_id_fkey
    FOREIGN KEY (jeopardy_buzzer_winner_id)
    REFERENCES game_participants(id) ON DELETE SET NULL;


-- ============================================================================
-- 13. RLS (Row Level Security)
-- ============================================================================
--
-- 【중요】 애플리케이션은 거의 모든 DB 접근에 service_role 키를 사용합니다.
--         service_role 은 RLS 를 우회하므로, 아래 정책들은 실질적으로
--         "anon 키로 직접 접근했을 때"만 적용됩니다.
--
-- 현재 상태 요약
--   RLS 꺼짐 (4개) : admin_users, instructor_users, system_logs, tb_test
--   RLS 켜짐+전면허용: 대부분의 게임 테이블 (USING true / WITH CHECK true)
--   RLS 켜짐+정책없음: quiz_question_history (service_role 전용)
--
-- ⚠ 보안 이슈 (미해결)
--   admin_users 와 instructor_users 는 RLS 가 꺼져 있어 anon 키만 있으면
--   password_hash 를 포함한 전체 행을 읽고 쓸 수 있습니다.
--   anon 키는 클라이언트에 노출되는 값이므로 실질적인 위험입니다.
--   다만 RLS 를 그냥 켜면 정책이 없어 모든 접근이 차단되므로,
--   각 테이블을 anon 으로 접근하는 코드가 있는지 먼저 확인해야 합니다.
--
-- ⚠ game_rooms / game_sessions 정책은 auth.uid() 를 사용하는데
--   이 프로젝트는 Supabase Auth 를 쓰지 않습니다(Custom JWT).
--   따라서 auth.uid() 는 항상 NULL 이고 해당 정책은 아무도 통과하지 못합니다.
--   초기 설계(Supabase Auth 전제)의 잔재입니다.

-- 인증/시스템 테이블 (RLS 비활성)
ALTER TABLE admin_users      DISABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs      DISABLE ROW LEVEL SECURITY;
ALTER TABLE tb_test          DISABLE ROW LEVEL SECURITY;

-- 게임 공통
ALTER TABLE game_rooms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_actions      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "활성 방은 모두 조회 가능" ON game_rooms
    FOR SELECT USING (status = ANY (ARRAY['waiting'::room_status, 'in_progress'::room_status]));
CREATE POLICY "강사는 자신의 방 수정 가능" ON game_rooms
    FOR UPDATE USING (auth.uid() = instructor_id);   -- ※ 위 주의사항 참고

CREATE POLICY "방 참가자는 모두 조회 가능" ON game_participants FOR SELECT USING (true);
CREATE POLICY "누구나 게임 참가 가능"     ON game_participants FOR INSERT WITH CHECK (true);
CREATE POLICY "참가자 정보 수정 가능"     ON game_participants FOR UPDATE USING (true);

CREATE POLICY "게임 세션 조회 가능" ON game_sessions FOR SELECT USING (true);
CREATE POLICY "강사는 자신의 방 세션 생성 가능" ON game_sessions
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM game_rooms
                WHERE game_rooms.id = game_sessions.room_id
                  AND game_rooms.instructor_id = auth.uid())
    );

CREATE POLICY "게임 액션 조회 가능"      ON game_actions FOR SELECT USING (true);
CREATE POLICY "누구나 게임 액션 생성 가능" ON game_actions FOR INSERT WITH CHECK (true);

-- 퀴즈
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_answers   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "퀴즈 문제 조회 가능" ON quiz_questions FOR SELECT USING (true);
CREATE POLICY "퀴즈 문제 생성 가능" ON quiz_questions FOR INSERT WITH CHECK (true);
CREATE POLICY "퀴즈 문제 수정 가능" ON quiz_questions FOR UPDATE USING (true);
CREATE POLICY "퀴즈 문제 삭제 가능" ON quiz_questions FOR DELETE USING (true);

CREATE POLICY "퀴즈 답변 조회 가능" ON quiz_answers FOR SELECT USING (true);
CREATE POLICY "퀴즈 답변 생성 가능" ON quiz_answers FOR INSERT WITH CHECK (true);
CREATE POLICY "퀴즈 답변 수정 가능" ON quiz_answers FOR UPDATE USING (true);

-- 그림 그리기
ALTER TABLE drawing_words   ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawing_rounds  ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawing_guesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY drawing_words_select ON drawing_words FOR SELECT USING (true);
CREATE POLICY drawing_words_insert ON drawing_words FOR INSERT WITH CHECK (true);
CREATE POLICY drawing_words_update ON drawing_words FOR UPDATE USING (true);
CREATE POLICY drawing_words_delete ON drawing_words FOR DELETE USING (true);

CREATE POLICY drawing_rounds_select ON drawing_rounds FOR SELECT USING (true);
CREATE POLICY drawing_rounds_insert ON drawing_rounds FOR INSERT WITH CHECK (true);
CREATE POLICY drawing_rounds_update ON drawing_rounds FOR UPDATE USING (true);
CREATE POLICY drawing_rounds_delete ON drawing_rounds FOR DELETE USING (true);

CREATE POLICY drawing_guesses_select ON drawing_guesses FOR SELECT USING (true);
CREATE POLICY drawing_guesses_insert ON drawing_guesses FOR INSERT WITH CHECK (true);
CREATE POLICY drawing_guesses_update ON drawing_guesses FOR UPDATE USING (true);

-- 사다리 (ALL 명령 단일 정책)
ALTER TABLE ladder_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ladder_data       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ladder_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY ladder_items_open      ON ladder_items      FOR ALL USING (true);
CREATE POLICY ladder_data_open       ON ladder_data       FOR ALL USING (true);
CREATE POLICY ladder_selections_open ON ladder_selections FOR ALL USING (true);

-- 설문조사
ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_answers   ENABLE ROW LEVEL SECURITY;

CREATE POLICY survey_questions_public_read   ON survey_questions FOR SELECT USING (true);
CREATE POLICY survey_questions_public_insert ON survey_questions FOR INSERT WITH CHECK (true);
CREATE POLICY survey_questions_public_update ON survey_questions FOR UPDATE USING (true);
CREATE POLICY survey_questions_public_delete ON survey_questions FOR DELETE USING (true);

CREATE POLICY survey_answers_public_read   ON survey_answers FOR SELECT USING (true);
CREATE POLICY survey_answers_public_insert ON survey_answers FOR INSERT WITH CHECK (true);

-- 제퍼디쇼
ALTER TABLE jeopardy_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeopardy_buzzer_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY jeopardy_questions_select ON jeopardy_questions FOR SELECT USING (true);
CREATE POLICY jeopardy_questions_insert ON jeopardy_questions FOR INSERT WITH CHECK (true);
CREATE POLICY jeopardy_questions_update ON jeopardy_questions FOR UPDATE USING (true);
CREATE POLICY jeopardy_questions_delete ON jeopardy_questions FOR DELETE USING (true);

CREATE POLICY jeopardy_buzzer_log_select ON jeopardy_buzzer_log FOR SELECT USING (true);
CREATE POLICY jeopardy_buzzer_log_insert ON jeopardy_buzzer_log FOR INSERT WITH CHECK (true);
CREATE POLICY jeopardy_buzzer_log_update ON jeopardy_buzzer_log FOR UPDATE USING (true);


-- ============================================================================
-- 14. Storage 버킷
-- ============================================================================
-- 퀴즈 문제 이미지 보관용. 공개 버킷이라 URL 을 아는 사람은 볼 수 있다
-- (문제 이미지라 민감 정보가 아니라는 전제).
-- 업로드는 service_role 키를 쓰는 API Route 경유이므로 익명 쓰기 권한은 없다.
--
--   insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
--   values ('quiz-images', 'quiz-images', true, 5242880,
--           array['image/jpeg','image/png','image/webp','image/gif']);


-- ============================================================================
-- 부록. 마이그레이션 이력 (Supabase 기록 기준)
-- ============================================================================
-- 20251126234751  create_tb_test_table
-- 20251127150926  enable_uuid_extension
-- 20251127150944  create_enum_types
-- 20251127151014  create_tables
-- 20251127151033  create_indexes
-- 20251127151100  setup_rls_policies
-- 20251127151125  create_functions_and_triggers
-- 20251127151147  setup_initial_data_and_grants
-- 20251210230624  add_ladder_game_tables
-- 20260304064714  add_survey_game_type
-- 20260304064722  create_survey_tables
-- 20260316060601  add_jeopardy_game
-- 20260316060613  add_jeopardy_tables
-- 20260316072013  add_jeopardy_question_type_options
-- 20260323004501  add_jeopardy_buzzer_answer
-- 20260811033448  create_quiz_question_history   ← 오늘 추가분
-- 20260813080927  add_ladder_items_is_auto       ← 오늘 추가분
-- 20260813143146  create_rejoin_requests
-- 20260907xxxxxx  add_quiz_questions_image_url   ← 2026-09-07 추가분
-- 20260907xxxxxx  quiz_time_limit_default_none   ← 2026-09-07 추가분
--
-- ※ 퀴즈/그림 그리기 테이블은 마이그레이션 기록 없이 생성되어
--    위 목록에 별도 항목이 없습니다 (create_tables 이후 직접 생성된 것으로 보임).
-- ============================================================================
