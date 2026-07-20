'use client'

import { Slot } from '@radix-ui/react-slot'
import { getSvgPath } from 'figma-squircle'
import { interpolate } from 'flubber'
import { LazyMotion, domAnimation, m as _m } from 'motion/react'
import {
  animate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
  type MotionStyle,
  type MotionValue,
  type SpringOptions,
} from 'motion/react'
import React, { useCallback, useEffect, useState } from 'react'
import useMeasure from 'react-use-measure'

import { cn } from '@/lib/utils'

const m = _m!

type SortMode = 'recent' | 'oldest' | 'liked'

const PEN_PATH =
  'M3.78181 16.3092L3 21L7.69086 20.2182C8.50544 20.0825 9.25725 19.6956 9.84119 19.1116L20.4198 8.53288C21.1934 7.75922 21.1934 6.5049 20.4197 5.73126L18.2687 3.58024C17.495 2.80658 16.2406 2.80659 15.4669 3.58027L4.88841 14.159C4.30447 14.7429 3.91757 15.4947 3.78181 16.3092Z'
const TICK_PATH =
  'M7.959 20.513L1.592 12.872L3.128 11.592L8.041 17.487L20.947 3.587L22.413 4.948L7.959 20.513Z'

const OPEN_GAP = 8
const CORNER_RADIUS = 12
const GAP_SPRING = { stiffness: 200, damping: 28, mass: 1 } as SpringOptions
const ICON_SPRING = { stiffness: 200, damping: 28 } as SpringOptions
const SWAY_SPRING = { stiffness: 200, damping: 24 } as SpringOptions

export type SortPickerDialValues = {
  Motion?: {
    gapSpringStiffness?: number
    gapSpringDamping?: number
    gapSpringMass?: number
    iconSpringStiffness?: number
    iconSpringDamping?: number
    swaySpringStiffness?: number
    swaySpringDamping?: number
  }
  Layout?: {
    segmentHeight?: number
    segmentPaddingX?: number
    openGap?: number
    toggleButtonWidth?: number
    cornerRadius?: number
    cornerSmoothing?: number
    iconSize?: number
    iconStrokeWidth?: number
  }
  Typography?: {
    fontSize?: number
    fontWeight?: string
    letterSpacing?: number
    noWrap?: boolean
  }
  Interaction?: {
    hoverScale?: number
    pressScale?: number
    disabledOpacity?: number
    activeOpacity?: number
  }
  Colors?: {
    segmentBg?: string
    segmentBgDark?: string
    textColor?: string
    textColorDark?: string
    iconColor?: string
    dashColor?: string
    dashColorDark?: string
    borderColor?: string
  }
  Sorting?: {
    defaultSort?: string
    autoApply?: boolean
  }
}

export type SortPickerProps = {
  value: SortMode
  onChange?: (value: SortMode) => void
  defaultOpen?: boolean
  disabled?: boolean
  className?: string
  dial?: SortPickerDialValues
}

type SortCategory = 'date' | 'likes'
type SortDirection = 'newest' | 'oldest' | 'most'

type SquircleSegmentProps = {
  asChild?: boolean
  cornerSmoothing?: number
  leftRadius: number | MotionValue<number>
  rightRadius: number | MotionValue<number>
  className?: string
  style?: MotionStyle
  children: React.ReactNode
}

const MotionSlot = m.create(Slot)

const radiusValue = (radius: number | MotionValue<number>) =>
  typeof radius === 'number' ? radius : radius.get()

const SquircleSegment = ({
  asChild,
  cornerSmoothing = 1,
  leftRadius,
  rightRadius,
  className,
  style,
  children,
}: SquircleSegmentProps) => {
  const Component = asChild ? MotionSlot : m.div
  const [ref, bounds] = useMeasure()
  const width = useMotionValue(0)
  const height = useMotionValue(0)

  useEffect(() => {
    width.set(bounds.width)
    height.set(bounds.height)
  }, [bounds.width, bounds.height, width, height])

  const clipPath = useTransform(() => {
    const w = width.get()
    const h = height.get()
    if (w <= 0 || h <= 0) {
      return 'none'
    }
    const left = radiusValue(leftRadius)
    const right = radiusValue(rightRadius)
    const path = getSvgPath({
      width: w,
      height: h,
      topLeftCornerRadius: left,
      bottomLeftCornerRadius: left,
      topRightCornerRadius: right,
      bottomRightCornerRadius: right,
      cornerSmoothing,
    })
    return `path('${path}')`
  })

  return (
    <Component
      data-slot="sort-picker-segment"
      ref={ref}
      className={className}
      style={{ ...style, clipPath }}
    >
      {children}
    </Component>
  )
}

const CATEGORIES: { value: SortCategory; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'likes', label: 'Likes' },
]

const DIRECTIONS: Record<SortCategory, { value: SortDirection; label: string }[]> = {
  date: [
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
  ],
  likes: [{ value: 'most', label: 'Most' }],
}

const toSortMode = (
  category: SortCategory,
  direction: SortDirection
): SortMode => {
  if (category === 'date' && direction === 'newest') return 'recent'
  if (category === 'date' && direction === 'oldest') return 'oldest'
  return 'liked'
}

const fromSortMode = (
  mode: SortMode
): { category: SortCategory; direction: SortDirection } => {
  if (mode === 'recent') return { category: 'date', direction: 'newest' }
  if (mode === 'oldest') return { category: 'date', direction: 'oldest' }
  return { category: 'likes', direction: 'most' }
}

type SelectableFieldProps = {
  label: string
  icon?: string
  onClick: () => void
  isEditing: boolean
  swayX: MotionValue<number>
  dial?: SortPickerDialValues
}

const useIsDark = () => {
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const check = () => setIsDark(document.body.classList.contains('dark-mode'))
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return isDark
}

const SelectableField = ({
  label,
  icon,
  onClick,
  isEditing,
  swayX,
  dial,
}: SelectableFieldProps) => {
  const isDark = useIsDark()
  const c = dial?.Colors
  const t = dial?.Typography

  const textColor = isDark ? (c?.textColorDark ?? '#FFFFFF') : (c?.textColor ?? '#000000')
  const fontSize = t?.fontSize
  const fontWeight = t?.fontWeight
  const letterSpacing = t?.letterSpacing != null ? `${t.letterSpacing}px` : undefined
  const noWrap = t?.noWrap ?? true

  return (
    <m.button
      data-slot="sort-picker-field"
      type="button"
      onClick={onClick}
      disabled={!isEditing}
      style={{
        x: swayX,
        color: textColor,
        ...(fontSize != null ? { fontSize } : {}),
        ...(fontWeight != null ? { fontWeight } : {}),
        ...(letterSpacing != null ? { letterSpacing } : {}),
        ...(noWrap ? { whiteSpace: 'nowrap' as const } : {}),
      }}
      className="flex h-full w-full cursor-pointer items-center justify-center gap-1 border-0 bg-transparent text-center font-semibold text-black outline-none disabled:cursor-default dark:text-white"
    >
      {icon && <span className="text-sm">{icon}</span>}
      <span>{label}</span>
    </m.button>
  )
}

function SortPicker({
  value,
  onChange,
  defaultOpen = false,
  disabled = false,
  className,
  dial,
}: SortPickerProps) {
  const { category, direction } = fromSortMode(value)
  const [isEditing, setIsEditing] = useState(defaultOpen)
  const [localCategory, setLocalCategory] = useState<SortCategory>(category)
  const [localDirection, setLocalDirection] =
    useState<SortDirection>(direction)

  const shouldReduceMotion = useReducedMotion()
  const isDark = useIsDark()

  const l = dial?.Layout
  const motionConfig = dial?.Motion
  const c = dial?.Colors
  const i = dial?.Interaction

  const openGapVal = l?.openGap ?? OPEN_GAP
  const cornerRadiusVal = l?.cornerRadius ?? CORNER_RADIUS
  const segHeight = l?.segmentHeight
  const segPadX = l?.segmentPaddingX
  const toggleW = l?.toggleButtonWidth
  const iconSz = l?.iconSize ?? 18
  const iconStrokeVal = l?.iconStrokeWidth ?? 2.5
  const cornerSm = l?.cornerSmoothing ?? 1

  const gapSpringStiffness = motionConfig?.gapSpringStiffness
  const gapSpringDamping = motionConfig?.gapSpringDamping
  const gapSpringMass = motionConfig?.gapSpringMass
  const iconSpringStiffness = motionConfig?.iconSpringStiffness
  const iconSpringDamping = motionConfig?.iconSpringDamping

  const swaySpringConf = {
    ...SWAY_SPRING,
    stiffness: motionConfig?.swaySpringStiffness ?? SWAY_SPRING.stiffness,
    damping: motionConfig?.swaySpringDamping ?? SWAY_SPRING.damping,
  }

  const ogMotion = useMotionValue(openGapVal)
  const crMotion = useMotionValue(cornerRadiusVal)
  const isMotion = useMotionValue(iconStrokeVal)

  useEffect(() => { ogMotion.set(openGapVal) }, [openGapVal, ogMotion])
  useEffect(() => { crMotion.set(cornerRadiusVal) }, [cornerRadiusVal, crMotion])
  useEffect(() => { isMotion.set(iconStrokeVal) }, [iconStrokeVal, isMotion])

  const gap = useMotionValue(0)

  useEffect(() => {
    const target = isEditing ? openGapVal : 0
    if (shouldReduceMotion) {
      gap.jump(target)
      return
    }
    const ctrl = animate(gap, target, {
      ...GAP_SPRING,
      stiffness: gapSpringStiffness ?? GAP_SPRING.stiffness,
      damping: gapSpringDamping ?? GAP_SPRING.damping,
      mass: gapSpringMass ?? GAP_SPRING.mass,
    })
    return () => ctrl.stop()
  }, [isEditing, openGapVal, shouldReduceMotion, gap, gapSpringStiffness, gapSpringDamping, gapSpringMass])

  const segmentSpacing = useTransform(() => {
    const g = gap.get()
    const og = ogMotion.get()
    if (og <= 0) return '0px'
    const c = Math.min(1, Math.max(0, g / og))
    return `${Math.min(og, Math.max(0, g)) - (1 - c)}px`
  })

  const innerRadius = useTransform(() => {
    const g = gap.get()
    const og = ogMotion.get()
    const cr = crMotion.get()
    if (og <= 0) return 0
    const c = Math.min(1, Math.max(0, g / og))
    return cr * c
  })

  const gapVelocity = useVelocity(gap)
  const swayXRaw = useTransform(
    gapVelocity,
    [-70, 0, 70],
    [-3, 0, 3],
    { clamp: true }
  )
  const swayX = useSpring(swayXRaw, swaySpringConf)
  const iconProgress = useMotionValue(0)

  useEffect(() => {
    const target = isEditing ? 1 : 0
    if (shouldReduceMotion) {
      iconProgress.jump(target)
      return
    }
    const ctrl = animate(iconProgress, target, {
      ...ICON_SPRING,
      stiffness: iconSpringStiffness ?? ICON_SPRING.stiffness,
      damping: iconSpringDamping ?? ICON_SPRING.damping,
    })
    return () => ctrl.stop()
  }, [isEditing, shouldReduceMotion, iconProgress, iconSpringStiffness, iconSpringDamping])

  const iconPath = useTransform(iconProgress, [0, 1], [PEN_PATH, TICK_PATH], {
    clamp: true,
    mixer: (from, to) => interpolate(from, to, { maxSegmentLength: 1 }),
  })
  const iconStrokeWidth = useTransform(() => {
    const p = iconProgress.get()
    const s = isMotion.get()
    return p * s
  })
  const iconStrokeOpacity = useTransform(iconProgress, [0, 1], [0, 1], {
    clamp: true,
  })
  const iconDashOpacity = useTransform(
    iconProgress,
    [0, 0.4],
    [1, 0],
    { clamp: true }
  )

  const cycleCategory = useCallback(() => {
    setLocalCategory((prev) => {
      const idx = CATEGORIES.findIndex((c) => c.value === prev)
      return CATEGORIES[(idx + 1) % CATEGORIES.length].value
    })
  }, [])

  useEffect(() => {
    const dirs = DIRECTIONS[localCategory]
    setLocalDirection(dirs[0].value)
  }, [localCategory])

  const cycleDirection = useCallback(() => {
    setLocalDirection((prev) => {
      const dirs = DIRECTIONS[localCategory]
      const idx = dirs.findIndex((d) => d.value === prev)
      return dirs[(idx + 1) % dirs.length].value
    })
  }, [localCategory])

  const categoryLabel =
    CATEGORIES.find((c) => c.value === localCategory)?.label ?? 'Date'
  const directionLabel =
    DIRECTIONS[localCategory].find((d) => d.value === localDirection)
      ?.label ?? 'Newest'

  const currentSortMode = toSortMode(localCategory, localDirection)

  const toggleEdit = () => {
    if (disabled) return
    const next = !isEditing
    setIsEditing(next)
    if (!next) {
      onChange?.(currentSortMode)
    }
  }

  const segBg = isDark ? (c?.segmentBgDark ?? '#262626') : (c?.segmentBg ?? '#F4F4F9')
  const iconColor = c?.iconColor ?? '#868593'
  const dashStroke = isDark ? (c?.dashColorDark ?? '#262626') : (c?.dashColor ?? '#F4F4F9')
  const borderColor = c?.borderColor ?? 'transparent'
  const disabledOp = i?.disabledOpacity ?? 0.5

  const segmentStyle: MotionStyle = {
    ...(segHeight != null ? { height: segHeight } : {}),
    ...(segPadX != null ? { paddingLeft: segPadX, paddingRight: segPadX } : {}),
    backgroundColor: segBg,
    borderColor,
  }

  return (
    <LazyMotion features={domAnimation}>
    <m.div
      data-slot="sort-picker"
      data-editing={isEditing || undefined}
      data-disabled={disabled || undefined}
      className={cn(
        'flex flex-row items-center justify-center',
        disabled && 'opacity-50',
        className
      )}
      style={{ opacity: disabled ? disabledOp : undefined }}
    >
      <SquircleSegment
        leftRadius={cornerRadiusVal}
        rightRadius={innerRadius}
        cornerSmoothing={cornerSm}
        className="flex shrink-0 h-12 items-center px-3 bg-[#F4F4F9] dark:bg-[#262626]"
        style={segmentStyle}
      >
        <SelectableField
          label={categoryLabel}
          onClick={cycleCategory}
          isEditing={isEditing}
          swayX={swayX}
          dial={dial}
        />
      </SquircleSegment>
      <SquircleSegment
        leftRadius={innerRadius}
        rightRadius={innerRadius}
        cornerSmoothing={cornerSm}
        style={{ marginLeft: segmentSpacing, ...segmentStyle }}
        className="flex shrink-0 h-12 items-center px-3 bg-[#F4F4F9] dark:bg-[#262626]"
      >
        <SelectableField
          label={directionLabel}
          onClick={cycleDirection}
          isEditing={isEditing}
          swayX={swayX}
          dial={dial}
        />
      </SquircleSegment>
      <SquircleSegment
        asChild
        leftRadius={innerRadius}
        rightRadius={cornerRadiusVal}
        cornerSmoothing={cornerSm}
        style={{ marginLeft: segmentSpacing, ...segmentStyle }}
      >
        <button
          data-slot="sort-picker-toggle"
          type="button"
          onClick={toggleEdit}
          disabled={disabled}
          aria-label={isEditing ? 'Apply sort' : 'Change sort'}
          style={{
            ...(segHeight != null ? { height: segHeight } : {}),
            ...(toggleW != null ? { width: toggleW } : {}),
            backgroundColor: segBg,
          }}
          className="flex shrink-0 h-12 w-12 items-center justify-center bg-[#F4F4F9] transition-transform active:scale-90 disabled:active:scale-100 dark:bg-[#262626]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width={iconSz}
            height={iconSz}
          >
            <m.path
              fill={iconColor}
              stroke={iconColor}
              strokeWidth={0}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{
                strokeWidth: iconStrokeWidth,
                strokeOpacity: iconStrokeOpacity,
              }}
              d={iconPath}
            />
            <m.path
              d="M14 6L18 10"
              fill="none"
              stroke={dashStroke}
              strokeWidth={1.5}
              strokeLinecap="round"
              style={{ opacity: iconDashOpacity }}
            />
          </svg>
        </button>
      </SquircleSegment>
    </m.div>
    </LazyMotion>
  )
}

export { SortPicker }
export default SortPicker
