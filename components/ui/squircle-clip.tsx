'use client'

import { Slot } from '@radix-ui/react-slot'
import { getSvgPath } from 'figma-squircle'
import { useCallback, useEffect, useRef } from 'react'

type SquircleClipProps = {
  asChild?: boolean
  cornerRadius?: number
  cornerSmoothing?: number
  stroke?: string
  strokeWidth?: number
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}

export function SquircleClip({
  asChild,
  cornerRadius = 10,
  cornerSmoothing = 1,
  stroke,
  strokeWidth = 1,
  className,
  style,
  children,
}: SquircleClipProps) {
  const elRef = useRef<HTMLElement | null>(null)
  const pathRef = useRef<SVGPathElement | null>(null)

  const applyClipPath = useCallback(
    (el: HTMLElement) => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w <= 0 || h <= 0) return
      const pathData = getSvgPath({ width: w, height: h, cornerRadius, cornerSmoothing })
      el.style.clipPath = `path('${pathData}')`
      if (pathRef.current) {
        pathRef.current.setAttribute('d', pathData)
      }
    },
    [cornerRadius, cornerSmoothing]
  )

  useEffect(() => {
    const el = elRef.current
    if (!el) return
    applyClipPath(el)
    const ro = new ResizeObserver(() => applyClipPath(el))
    ro.observe(el)
    return () => ro.disconnect()
  }, [applyClipPath])

  const refCallback = useCallback((el: HTMLElement | null) => {
    elRef.current = el
  }, [])

  const Component = asChild ? Slot : 'div'

  if (!stroke) {
    return (
      <Component ref={refCallback} className={className} style={style}>
        {children}
      </Component>
    )
  }

  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      <Component ref={refCallback}>
        {children}
      </Component>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <path ref={pathRef} fill="none" strokeWidth={strokeWidth} style={{ stroke }} />
      </svg>
    </div>
  )
}
