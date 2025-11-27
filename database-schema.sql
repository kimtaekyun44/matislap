-- 🎮 MetisLap Database Schema
-- Supabase (PostgreSQL) 데이터베이스 스키마

-- ========================================
-- 1. 기본 설정
-- ========================================

-- UUID 확장 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- 2. Enum 타입 정의
-- ========================================

-- 사용자 역할
CREATE TYPE user_role AS ENUM ('master', 'instructor', 'student');

-- 강사 승인 상태
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');

-- 게임 타입
CREATE TYPE game_type AS ENUM ('quiz', 'drawing', 'word_chain', 'speed_quiz', 'voting');

-- 방 상태
CREATE TYPE room_status AS ENUM ('waiting', 'in_progress', 'finished');

-- ========================================
-- 3. 테이블 생성
-- ========================================

-- 관리자 테이블 (Supabase Auth와 별개)
CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    must_change_password BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 강사 프로필 (Supabase Auth 확장)
CREATE TABLE instructor_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    organization VARCHAR(255),
    phone VARCHAR(20),
    approval_status approval_status DEFAULT 'pending',
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES admin_users(id),
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 게임 방
CREATE TABLE game_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_code VARCHAR(6) UNIQUE NOT NULL,
    instructor_id UUID NOT NULL REFERENCES instructor_profiles(id) ON DELETE CASCADE,
    game_type game_type NOT NULL,
    room_name VARCHAR(255) NOT NULL,
    max_participants INTEGER DEFAULT 30,
    status room_status DEFAULT 'waiting',
    game_config JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 게임 참가자 (학생)
CREATE TABLE game_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    nickname VARCHAR(50) NOT NULL,
    avatar_url TEXT,
    connection_id TEXT, -- Realtime connection ID
    is_active BOOLEAN DEFAULT true,
    score INTEGER DEFAULT 0,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    UNIQUE(room_id, nickname)
);

-- 게임 세션 로그
CREATE TABLE game_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    game_type game_type NOT NULL,
    game_data JSONB DEFAULT '{}',
    results JSONB DEFAULT '{}',
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 게임 액션 로그 (실시간 이벤트 기록)
CREATE TABLE game_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES game_participants(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL,
    action_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 시스템 로그
CREATE TABLE system_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    user_type user_role,
    action VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- 4. 인덱스 생성
-- ========================================

CREATE INDEX idx_instructor_profiles_approval_status ON instructor_profiles(approval_status);
CREATE INDEX idx_game_rooms_instructor_id ON game_rooms(instructor_id);
CREATE INDEX idx_game_rooms_status ON game_rooms(status);
CREATE INDEX idx_game_rooms_room_code ON game_rooms(room_code);
CREATE INDEX idx_game_participants_room_id ON game_participants(room_id);
CREATE INDEX idx_game_sessions_room_id ON game_sessions(room_id);
CREATE INDEX idx_game_actions_session_id ON game_actions(session_id);
CREATE INDEX idx_system_logs_created_at ON system_logs(created_at DESC);

-- ========================================
-- 5. RLS (Row Level Security) 정책
-- ========================================

-- RLS 활성화
ALTER TABLE instructor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_actions ENABLE ROW LEVEL SECURITY;

-- 강사 프로필 정책
CREATE POLICY "강사는 자신의 프로필 조회 가능" 
    ON instructor_profiles FOR SELECT 
    USING (auth.uid() = id);

CREATE POLICY "승인된 강사 프로필은 모두 조회 가능" 
    ON instructor_profiles FOR SELECT 
    USING (approval_status = 'approved');

CREATE POLICY "강사는 자신의 프로필 수정 가능" 
    ON instructor_profiles FOR UPDATE 
    USING (auth.uid() = id AND approval_status = 'approved');

-- 게임 방 정책
CREATE POLICY "강사는 자신의 방 생성 가능" 
    ON game_rooms FOR INSERT 
    WITH CHECK (
        auth.uid() = instructor_id AND 
        EXISTS (
            SELECT 1 FROM instructor_profiles 
            WHERE id = auth.uid() AND approval_status = 'approved'
        )
    );

CREATE POLICY "강사는 자신의 방 수정 가능" 
    ON game_rooms FOR UPDATE 
    USING (auth.uid() = instructor_id);

CREATE POLICY "활성 방은 모두 조회 가능" 
    ON game_rooms FOR SELECT 
    USING (status IN ('waiting', 'in_progress'));

-- 참가자 정책
CREATE POLICY "방 참가자는 모두 조회 가능" 
    ON game_participants FOR SELECT 
    USING (true);

CREATE POLICY "누구나 게임 참가 가능" 
    ON game_participants FOR INSERT 
    WITH CHECK (true);

-- ========================================
-- 6. 함수 생성
-- ========================================

-- 방 코드 생성 함수
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
    code TEXT;
    exists BOOLEAN;
BEGIN
    LOOP
        -- 6자리 랜덤 코드 생성 (숫자+대문자)
        code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
        
        -- 중복 확인
        SELECT EXISTS(SELECT 1 FROM game_rooms WHERE room_code = code) INTO exists;
        
        IF NOT exists THEN
            RETURN code;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 방 생성 시 자동으로 코드 생성
CREATE OR REPLACE FUNCTION set_room_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.room_code IS NULL OR NEW.room_code = '' THEN
        NEW.room_code := generate_room_code();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_room_code_trigger
    BEFORE INSERT ON game_rooms
    FOR EACH ROW
    EXECUTE FUNCTION set_room_code();

-- updated_at 자동 업데이트
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_instructor_profiles_updated_at
    BEFORE UPDATE ON instructor_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_game_rooms_updated_at
    BEFORE UPDATE ON game_rooms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ========================================
-- 7. 초기 데이터
-- ========================================

-- 기본 관리자 계정 생성 (비밀번호: changeme123!)
-- bcrypt hash for 'changeme123!'
INSERT INTO admin_users (email, password_hash, name, must_change_password)
VALUES (
    'admin@metislap.com',
    '$2b$10$YourBcryptHashHere', -- 실제 배포 시 bcrypt로 생성한 해시값 입력
    'System Admin',
    true
);

-- ========================================
-- 8. 권한 부여
-- ========================================

-- Supabase anon 권한
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT INSERT ON game_participants TO anon;

-- Supabase authenticated 권한  
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
