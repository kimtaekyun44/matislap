import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// 이력 추적 대상 필드
export const TRACKED_FIELDS = [
  'question_text',
  'question_type',
  'options',
  'correct_answer',
  'time_limit',
  'points',
  'order_num',
  'image_url',
] as const

export type QuizHistoryAction = 'create' | 'update' | 'delete'

export interface FieldChange {
  before: unknown
  after: unknown
}

type QuizQuestionRow = Record<string, unknown>

// 조인 결과(game_rooms 등)를 걷어내고 추적 대상 필드만 남긴다
export function pickSnapshot(question: QuizQuestionRow): QuizQuestionRow {
  const snapshot: QuizQuestionRow = {}
  for (const field of TRACKED_FIELDS) {
    snapshot[field] = question[field] ?? null
  }
  return snapshot
}

// 변경 전/후를 비교해 실제로 바뀐 필드만 추출
export function diffQuizQuestion(
  before: QuizQuestionRow,
  after: QuizQuestionRow
): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {}

  for (const field of TRACKED_FIELDS) {
    const prev = before[field] ?? null
    const next = after[field] ?? null

    // options는 jsonb 배열이라 참조 비교로는 안 잡히므로 직렬화해서 비교
    if (JSON.stringify(prev) === JSON.stringify(next)) continue

    changes[field] = { before: prev, after: next }
  }

  return changes
}

interface RecordQuizHistoryParams {
  questionId: string
  roomId: string
  action: QuizHistoryAction
  instructorId?: string | null
  instructorName?: string | null
  roomStatus?: string | null
  orderNum?: number | null
  changedFields?: Record<string, FieldChange>
  snapshot?: QuizQuestionRow | null
}

/**
 * 퀴즈 문제 변경 이력을 기록한다.
 * 이력 기록 실패가 본 작업(수정/삭제)을 되돌리면 안 되므로 예외를 삼키고 로그만 남긴다.
 */
export async function recordQuizHistory(
  params: RecordQuizHistoryParams
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('quiz_question_history')
      .insert({
        question_id: params.questionId,
        room_id: params.roomId,
        action: params.action,
        instructor_id: params.instructorId ?? null,
        instructor_name: params.instructorName ?? null,
        room_status: params.roomStatus ?? null,
        order_num: params.orderNum ?? null,
        changed_fields: params.changedFields ?? {},
        snapshot: params.snapshot ?? null,
      })

    if (error) {
      console.error('퀴즈 이력 기록 오류:', error)
    }
  } catch (error) {
    console.error('퀴즈 이력 기록 예외:', error)
  }
}
