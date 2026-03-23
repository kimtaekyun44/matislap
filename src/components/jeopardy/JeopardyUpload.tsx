'use client'

import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/utils/api'
import toast from 'react-hot-toast'

type QuestionType = 'short_answer' | '2지선다' | '4지선다'

interface ParsedRow {
  category: string
  points: number
  question_type: QuestionType
  content: string
  options: string[]
  answer: string
}

interface ValidationError {
  row: number
  message: string
}

interface JeopardyQuestion {
  id: string
  category: string
  points: number
  question_type: QuestionType
  content: string
  options: string[]
  answer: string
  is_used: boolean
}

interface Props {
  roomId: string
  existingQuestions: JeopardyQuestion[]
  onUploadSuccess: () => void
}

const VALID_TYPES: QuestionType[] = ['short_answer', '2지선다', '4지선다']
const TYPE_LABELS: Record<string, string> = {
  short_answer: '주관식',
  '2지선다': '2지선다',
  '4지선다': '4지선다',
}

function parseExcelRows(sheetData: string[][]): {
  rows: ParsedRow[]
  errors: ValidationError[]
} {
  const rows: ParsedRow[] = []
  const errors: ValidationError[] = []

  // 첫 번째 행은 헤더 → 건너뜀
  const dataRows = sheetData.slice(1).filter(r => r.some(cell => String(cell ?? '').trim() !== ''))

  const categorySet = new Set<string>()

  dataRows.forEach((raw, i) => {
    const rowNum = i + 2 // 헤더 포함 실제 엑셀 행 번호
    const [catRaw, pointsRaw, typeRaw, contentRaw, opt1, opt2, opt3, opt4, answerRaw] = raw.map(
      c => String(c ?? '').trim()
    )

    const missing: string[] = []
    if (!catRaw) missing.push('카테고리')
    if (!pointsRaw) missing.push('점수')
    if (!typeRaw) missing.push('유형')
    if (!contentRaw) missing.push('문제')
    if (!answerRaw) missing.push('정답')
    if (missing.length > 0) {
      errors.push({ row: rowNum, message: `필수 항목 누락: ${missing.join(', ')}` })
      return
    }

    const points = parseInt(pointsRaw, 10)
    if (isNaN(points) || points <= 0) {
      errors.push({ row: rowNum, message: `점수는 양수 정수여야 합니다. (입력값: "${pointsRaw}")` })
      return
    }

    // 유형 정규화 (한글 '주관식' → 'short_answer')
    const normalizedType = typeRaw === '주관식' ? 'short_answer' : typeRaw as QuestionType
    if (!VALID_TYPES.includes(normalizedType)) {
      errors.push({ row: rowNum, message: `유형은 "주관식", "2지선다", "4지선다" 중 하나여야 합니다. (입력값: "${typeRaw}")` })
      return
    }

    // 보기 검증
    const options: string[] = []
    if (normalizedType === '2지선다') {
      if (!opt1 || !opt2) {
        errors.push({ row: rowNum, message: '2지선다는 보기1, 보기2가 필수입니다.' })
        return
      }
      options.push(opt1, opt2)
      if (!options.includes(answerRaw)) {
        errors.push({ row: rowNum, message: `정답("${answerRaw}")이 보기(${options.join(', ')}) 중에 없습니다.` })
        return
      }
    } else if (normalizedType === '4지선다') {
      if (!opt1 || !opt2 || !opt3 || !opt4) {
        errors.push({ row: rowNum, message: '4지선다는 보기1~4가 모두 필수입니다.' })
        return
      }
      options.push(opt1, opt2, opt3, opt4)
      if (!options.includes(answerRaw)) {
        errors.push({ row: rowNum, message: `정답("${answerRaw}")이 보기(${options.join(', ')}) 중에 없습니다.` })
        return
      }
    }

    categorySet.add(catRaw)
    rows.push({
      category: catRaw,
      points,
      question_type: normalizedType,
      content: contentRaw,
      options,
      answer: answerRaw,
    })
  })

  // 카테고리 + 점수 중복 검사
  const seen = new Set<string>()
  rows.forEach((r, i) => {
    const key = `${r.category}__${r.points}`
    if (seen.has(key)) {
      errors.push({ row: i + 2, message: `카테고리 "${r.category}" + 점수 ${r.points}점 조합이 중복됩니다.` })
    }
    seen.add(key)
  })

  // 카테고리 5개 초과 검사
  if (categorySet.size > 5) {
    errors.push({ row: 0, message: `카테고리는 최대 5개까지 허용됩니다. (현재 ${categorySet.size}개)` })
  }

  return { rows, errors }
}

export default function JeopardyUpload({ roomId, existingQuestions, onUploadSuccess }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })
        const { rows, errors } = parseExcelRows(raw as string[][])
        setParsedRows(rows)
        setErrors(errors)
      } catch {
        toast.error('파일을 읽는 중 오류가 발생했습니다.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleUpload = async () => {
    if (parsedRows.length === 0) return
    if (errors.length > 0) {
      toast.error('오류를 먼저 수정해주세요.')
      return
    }

    setUploading(true)
    try {
      const res = await apiFetch('/api/games/jeopardy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, questions: parsedRows }),
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || '업로드에 실패했습니다.')
        return
      }

      const data = await res.json()
      toast.success(`${data.count}개 문제가 저장되었습니다.`)
      setParsedRows([])
      setErrors([])
      setFileName(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      onUploadSuccess()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setUploading(false)
    }
  }

  const handleReset = () => {
    setParsedRows([])
    setErrors([])
    setFileName(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // 카테고리별로 그룹화하여 보드 형태로 표시
  const buildBoard = (questions: JeopardyQuestion[]) => {
    const categories = [...new Set(questions.map(q => q.category))]
    const allPoints = [...new Set(questions.map(q => q.points))].sort((a, b) => a - b)
    return { categories, allPoints }
  }

  const { categories: existingCats, allPoints: existingPoints } = buildBoard(existingQuestions)

  return (
    <div className="space-y-4">
      {/* 현재 등록된 문제 보드 - 행=카테고리, 열=점수 */}
      {existingQuestions.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">
            현재 등록된 문제 ({existingQuestions.length}개)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="border px-2 py-1 bg-muted text-left">카테고리</th>
                  {existingPoints.map(pts => (
                    <th key={pts} className="border px-2 py-1 bg-muted text-center w-14">{pts}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {existingCats.map(cat => (
                  <tr key={cat}>
                    <td className="border px-2 py-1 font-medium">{cat}</td>
                    {existingPoints.map(pts => {
                      const q = existingQuestions.find(q => q.category === cat && q.points === pts)
                      return (
                        <td key={pts} className="border px-2 py-1 text-center">
                          {q ? (
                            <span className={`inline-block px-1 rounded text-xs ${
                              q.is_used ? 'bg-gray-100 text-gray-400 line-through' : 'bg-blue-50 text-blue-700'
                            }`}>
                              {TYPE_LABELS[q.question_type]}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 업로드 영역 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">엑셀 파일 업로드</p>
          <a
            href="/sample/jeopardy_sample.xlsx"
            download
            className="text-xs text-blue-600 hover:underline"
          >
            샘플 파일 다운로드
          </a>
        </div>

        <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
          <div className="text-center">
            {fileName ? (
              <p className="text-sm font-medium text-primary">{fileName}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">클릭하여 파일 선택</p>
                <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls 파일</p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
      </div>

      {/* 오류 목록 */}
      {errors.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1">
          <p className="text-xs font-semibold text-red-700 mb-1">오류 {errors.length}건 — 수정 후 다시 업로드하세요</p>
          {errors.map((err, i) => (
            <p key={i} className="text-xs text-red-600">
              {err.row > 0 ? `${err.row}행: ` : ''}{err.message}
            </p>
          ))}
        </div>
      )}

      {/* 파싱 결과 미리보기 */}
      {parsedRows.length > 0 && errors.length === 0 && (
        <div>
          <p className="text-sm font-medium mb-2 text-green-700">
            미리보기 ({parsedRows.length}개 문제 인식됨)
          </p>
          <div className="overflow-x-auto max-h-56 overflow-y-auto rounded border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-2 py-1 text-left border-b">카테고리</th>
                  <th className="px-2 py-1 text-left border-b">점수</th>
                  <th className="px-2 py-1 text-left border-b">유형</th>
                  <th className="px-2 py-1 text-left border-b">문제</th>
                  <th className="px-2 py-1 text-left border-b">정답</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-2 py-1">{r.category}</td>
                    <td className="px-2 py-1 text-center font-medium">{r.points}</td>
                    <td className="px-2 py-1">{TYPE_LABELS[r.question_type]}</td>
                    <td className="px-2 py-1 max-w-[160px] truncate" title={r.content}>{r.content}</td>
                    <td className="px-2 py-1 max-w-[100px] truncate" title={r.answer}>{r.answer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 액션 버튼 */}
      {parsedRows.length > 0 && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={handleReset}
            disabled={uploading}
          >
            취소
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={handleUpload}
            disabled={uploading || errors.length > 0}
          >
            {uploading ? '저장 중...' : `${parsedRows.length}개 문제 저장`}
          </Button>
        </div>
      )}

      {existingQuestions.length > 0 && parsedRows.length > 0 && errors.length === 0 && (
        <p className="text-xs text-amber-600 text-center">
          저장 시 기존 문제 {existingQuestions.length}개가 모두 교체됩니다.
        </p>
      )}
    </div>
  )
}
