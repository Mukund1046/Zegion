'use client'

import { Slot } from '@radix-ui/react-slot'
import { getSvgPath } from 'figma-squircle'
import { useCallback, useEffect, useRef } from 'react'

type SquircleClipProps = {
  asChild?: boolean
  cornerRadius?: number
  cornerSmoothing?: number
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}

export function SquircleClip({
  asChild,
  cornerRadius = 10,
  cornerSmoothing = 1,
  className,
  style,
  children,
}: SquircleClipProps) {
  const elRef = useRef<HTMLElement | null>(null)

  const applyClipPath = useCallback(
    (el: HTMLElement) => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w <= 0 || h <= 0) return
      const path = getSvgPath({ width: w, height: h, cornerRadius, cornerSmoothing })
      el.style.clipPath = `path('${path}')`
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

  return (
    <Component ref={refCallback} className={className} style={style}>
      {children}
    </Component>
  )
}
