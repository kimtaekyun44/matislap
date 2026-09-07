'use client'

import { useEffect, useRef, useState } from 'react'

interface ImageLightboxProps {
  src: string
  alt?: string
  onClose: () => void
}

const MIN_SCALE = 1
const MAX_SCALE = 5

/**
 * 문제 이미지를 전체 화면으로 크게 보는 뷰어.
 * 폰에서 보는 경우가 많아 핀치 줌 / 더블탭 확대 / 끌어서 이동을 직접 처리한다.
 * (고정 오버레이 안에서는 브라우저 기본 확대가 제대로 동작하지 않는다)
 */
export default function ImageLightbox({ src, alt = '', onClose }: ImageLightboxProps) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  // 제스처 진행 중 값은 리렌더가 필요 없으므로 ref 에 둔다
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null)
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const lastTapRef = useRef(0)

  // 열려 있는 동안 뒤 화면이 스크롤되지 않게 한다
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const clamp = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))

  const applyScale = (next: number) => {
    const clamped = clamp(next)
    setScale(clamped)
    // 원래 크기로 돌아오면 위치도 가운데로 되돌린다
    if (clamped === 1) setOffset({ x: 0, y: 0 })
  }

  const distanceBetween = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.hypot(dx, dy)
  }

  const handleTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length === 2) {
      pinchRef.current = { distance: distanceBetween(event.touches), scale }
      dragRef.current = null
      return
    }

    if (event.touches.length === 1) {
      // 더블탭으로 확대/축소 토글
      const now = Date.now()
      if (now - lastTapRef.current < 300) {
        applyScale(scale > 1 ? 1 : 2.5)
        lastTapRef.current = 0
        return
      }
      lastTapRef.current = now

      if (scale > 1) {
        dragRef.current = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
          ox: offset.x,
          oy: offset.y,
        }
      }
    }
  }

  const handleTouchMove = (event: React.TouchEvent) => {
    if (event.touches.length === 2 && pinchRef.current) {
      const ratio = distanceBetween(event.touches) / pinchRef.current.distance
      applyScale(pinchRef.current.scale * ratio)
      return
    }

    if (event.touches.length === 1 && dragRef.current) {
      setOffset({
        x: dragRef.current.ox + (event.touches[0].clientX - dragRef.current.x),
        y: dragRef.current.oy + (event.touches[0].clientY - dragRef.current.y),
      })
    }
  }

  const handleTouchEnd = () => {
    pinchRef.current = null
    dragRef.current = null
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* 상단 조작 버튼 */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between p-3 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-2">
          <button
            onClick={() => applyScale(scale - 0.5)}
            disabled={scale <= MIN_SCALE}
            className="w-10 h-10 rounded-full bg-white/20 text-white text-xl disabled:opacity-30"
            aria-label="축소"
          >
            −
          </button>
          <button
            onClick={() => applyScale(scale + 0.5)}
            disabled={scale >= MAX_SCALE}
            className="w-10 h-10 rounded-full bg-white/20 text-white text-xl disabled:opacity-30"
            aria-label="확대"
          >
            +
          </button>
          {scale !== 1 && (
            <button
              onClick={() => applyScale(1)}
              className="px-3 h-10 rounded-full bg-white/20 text-white text-sm"
            >
              원래대로
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/20 text-white text-xl"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      {/* 이미지 영역 */}
      <div
        className="w-full h-full flex items-center justify-center overflow-hidden"
        style={{ touchAction: 'none' }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={(e) => applyScale(scale + (e.deltaY < 0 ? 0.3 : -0.3))}
        onDoubleClick={() => applyScale(scale > 1 ? 1 : 2.5)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-w-full max-h-full object-contain select-none"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: pinchRef.current || dragRef.current ? 'none' : 'transform 0.15s',
          }}
        />
      </div>

      <p className="absolute bottom-4 left-0 right-0 text-center text-white/60 text-xs">
        두 손가락으로 확대 · 더블탭으로 확대/축소 · 빈 곳을 누르면 닫힘
      </p>
    </div>
  )
}
