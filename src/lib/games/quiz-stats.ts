// 퀴즈 응답 통계 집계 헬퍼
// 답변이 선택지 "텍스트"로 저장되므로, options 배열에서 위치를 찾아 번호를 매긴다.
// (이력 기능의 번호 표기 규칙과 동일)

export interface QuizAnswerRecord {
  selected_answer: string | null
  is_correct: boolean | null
  answer_time_ms: number | null
  nickname: string
}

export interface DistributionBucket {
  // 선택지 번호. 선택지 목록에 없는 답변(문제 수정 전에 들어온 값 등)은 null
  number: number | null
  text: string
  count: number
  percent: number
  is_correct: boolean
  nicknames: string[]
}

const percentOf = (count: number, total: number) =>
  total > 0 ? Math.round((count / total) * 100) : 0

/**
 * 선택지 텍스트 비교용 정규화.
 * 문제를 수정할 때 선택지 끝에 공백이 붙는 일이 실제로 있었고(예: "filter(math > 50)  "),
 * 그 전에 제출된 답변은 공백 없이 저장되어 있다. 화면에서 구분도 안 되는 차이로
 * 응답이 통째로 "기타"로 빠지면 통계가 무의미해지므로 앞뒤 공백은 무시하고 맞춘다.
 */
const normalize = (value: string) => value.trim()

/**
 * 선택지별 응답 분포를 만든다.
 * 선택지 목록에 없는 답변은 뒤쪽에 별도 버킷으로 모은다 —
 * 게임 진행 중 문제 수정을 허용했기 때문에 실제로 발생할 수 있다.
 */
export function buildDistribution(
  options: unknown,
  correctAnswer: string,
  answers: QuizAnswerRecord[]
): DistributionBucket[] {
  const optionList = Array.isArray(options) ? options.map(String) : []
  const total = answers.length
  const normalizedCorrect = normalize(correctAnswer)

  const buckets: DistributionBucket[] = optionList.map((text, index) => ({
    number: index + 1,
    text: normalize(text),
    count: 0,
    percent: 0,
    is_correct: normalize(text) === normalizedCorrect,
    nicknames: [],
  }))

  // 선택지에 없는 답변을 텍스트별로 모으기 위한 인덱스
  const extraIndex = new Map<string, DistributionBucket>()

  for (const answer of answers) {
    const selected = normalize(answer.selected_answer ?? '')
    let bucket = buckets.find((item) => item.text === selected)

    if (!bucket) {
      bucket = extraIndex.get(selected)
      if (!bucket) {
        bucket = {
          number: null,
          text: selected,
          count: 0,
          percent: 0,
          is_correct: selected === normalizedCorrect,
          nicknames: [],
        }
        extraIndex.set(selected, bucket)
        buckets.push(bucket)
      }
    }

    bucket.count += 1
    bucket.nicknames.push(answer.nickname)
  }

  for (const bucket of buckets) {
    bucket.percent = percentOf(bucket.count, total)
  }

  return buckets
}

export interface QuestionSummary {
  total_answers: number
  correct_count: number
  incorrect_count: number
  accuracy: number
  average_time_ms: number
}

export function summarizeAnswers(answers: QuizAnswerRecord[]): QuestionSummary {
  const total = answers.length
  const correct = answers.filter((answer) => answer.is_correct).length

  const timed = answers.filter((answer) => answer.answer_time_ms != null)
  const averageTime =
    timed.length > 0
      ? Math.round(
          timed.reduce((sum, answer) => sum + (answer.answer_time_ms || 0), 0) /
            timed.length
        )
      : 0

  return {
    total_answers: total,
    correct_count: correct,
    incorrect_count: total - correct,
    accuracy: percentOf(correct, total),
    average_time_ms: averageTime,
  }
}
