/**
 * 업로드 전에 이미지를 줄인다.
 * 요즘 폰 사진은 4000px / 5MB 를 넘기기 일쑤인데, 문제 화면에서는 그만한 해상도가
 * 필요 없고 학생 모바일에서 로딩만 느려진다. 가로 기준 최대치로 축소해 올린다.
 */
export const resizeImageFile = async (
  file: File,
  maxWidth = 1600,
  quality = 0.85
): Promise<File> => {
  // GIF 는 애니메이션이 깨지므로 손대지 않는다
  if (file.type === 'image/gif') return file

  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file

  if (bitmap.width <= maxWidth) {
    bitmap.close()
    return file
  }

  const scale = maxWidth / bitmap.width
  const canvas = document.createElement('canvas')
  canvas.width = maxWidth
  canvas.height = Math.round(bitmap.height * scale)

  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return file
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  // 투명도가 있을 수 있는 png 는 png 로, 그 외에는 용량이 작은 jpeg 로
  const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outputType, quality)
  )

  if (!blob) return file

  // 축소 결과가 원본보다 크면 원본을 쓴다
  if (blob.size >= file.size) return file

  const extension = outputType === 'image/png' ? 'png' : 'jpg'
  return new File([blob], `image.${extension}`, { type: outputType })
}
