import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const INSTRUCTOR_JWT_SECRET = new TextEncoder().encode(
  process.env.INSTRUCTOR_JWT_SECRET || process.env.ADMIN_JWT_SECRET || 'fallback-secret-change-in-production'
)

const INSTRUCTOR_TOKEN_NAME = 'instructor_token'

export interface InstructorTokenPayload {
  instructorId: string
  email: string
  name: string
  approvalStatus: 'pending' | 'approved' | 'rejected'
  iat?: number
  exp?: number
}

export async function createInstructorToken(payload: Omit<InstructorTokenPayload, 'iat' | 'exp'>): Promise<string> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(INSTRUCTOR_JWT_SECRET)

  return token
}

export async function verifyInstructorToken(token: string): Promise<InstructorTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, INSTRUCTOR_JWT_SECRET)
    return payload as unknown as InstructorTokenPayload
  } catch {
    return null
  }
}

export async function getInstructorSession(): Promise<InstructorTokenPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(INSTRUCTOR_TOKEN_NAME)?.value

  if (!token) return null

  return verifyInstructorToken(token)
}

export async function setInstructorCookie(token: string) {
  const cookieStore = await cookies()
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
  cookieStore.set(INSTRUCTOR_TOKEN_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: basePath || '/',
  })
}

export async function clearInstructorCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(INSTRUCTOR_TOKEN_NAME)
}
