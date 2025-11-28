/**
 * 초기 관리자 계정 생성 스크립트
 *
 * 사용법:
 * npx ts-node --esm scripts/create-admin.ts
 *
 * 또는 환경변수로 실행:
 * ADMIN_USERNAME=admin ADMIN_PASSWORD=your-password npx ts-node --esm scripts/create-admin.ts
 */

import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!

const DEFAULT_USERNAME = process.env.ADMIN_USERNAME || 'admin'
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234!'

async function createAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // 비밀번호 해시
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12)

  // 관리자 계정 생성
  const { data, error } = await supabase
    .from('admin_users')
    .insert({
      username: DEFAULT_USERNAME,
      password_hash: passwordHash,
      role: 'master',
      must_change_password: true,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      console.log(`Admin user '${DEFAULT_USERNAME}' already exists.`)
    } else {
      console.error('Error creating admin:', error.message)
    }
    return
  }

  console.log('Admin user created successfully!')
  console.log(`Username: ${DEFAULT_USERNAME}`)
  console.log(`Password: ${DEFAULT_PASSWORD}`)
  console.log('\n*** Please change the password after first login! ***')
}

createAdmin()
