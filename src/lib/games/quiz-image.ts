import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export const QUIZ_IMAGE_BUCKET = 'quiz-images'
export const QUIZ_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const QUIZ_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]

export const QUIZ_IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

// 공개 URL 에서 버킷 내부 경로를 되돌린다. 우리 버킷의 URL 이 아니면 null.
export const pathFromPublicUrl = (url: string): string | null => {
  const marker = `/object/public/${QUIZ_IMAGE_BUCKET}/`
  const index = url.indexOf(marker)
  return index === -1 ? null : url.slice(index + marker.length)
}

/**
 * 문제에 붙어 있던 이미지를 스토리지에서 지운다.
 * 이미지 교체/문제 삭제 시 호출하며, 실패해도 본 작업을 되돌리지 않는다
 * (고아 파일이 남는 것보다 작업이 실패하는 쪽이 더 나쁘다).
 */
export const deleteQuizImage = async (imageUrl: string | null | undefined) => {
  if (!imageUrl) return

  const path = pathFromPublicUrl(imageUrl)
  if (!path) return

  try {
    // 방을 복사하면 여러 문제가 같은 파일을 가리킨다.
    // 아직 참조하는 문제가 남아 있으면 지우지 않는다 (다른 방 이미지가 깨진다).
    const { count } = await supabaseAdmin
      .from('quiz_questions')
      .select('id', { count: 'exact', head: true })
      .eq('image_url', imageUrl)

    if ((count ?? 0) > 0) return

    const { error } = await supabaseAdmin.storage
      .from(QUIZ_IMAGE_BUCKET)
      .remove([path])

    if (error) console.error('이미지 삭제 오류:', error)
  } catch (error) {
    console.error('이미지 삭제 예외:', error)
  }
}
