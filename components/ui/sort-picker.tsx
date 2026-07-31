'use client'

import { Slot } from '@radix-ui/react-slot'
import { getSvgPath } from 'figma-squircle'
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
import { HugeiconsIcon } from '@hugeicons/react'
import {
  PlusSignIcon,
  CheckIcon,
  ArrowDataTransferHorizontalIcon,
  Delete01Icon,
  Edit01Icon,
  ChevronDownIcon,
  ArrowDownDoubleIcon,
  ArrowUpDoubleIcon,
} from '@hugeicons/core-free-icons'

import {
  DEFAULT_SORT,
  getDefaultDirection,
  getDirectionArrow,
  getFieldDirectionOptions,
  getFieldLabel,
  SORT_FIELDS,
} from '@/lib/bookmark-utils'
import { Highlight, HighlightItem } from '@/components/animate-ui/primitives/effects/highlight'
import type { SortConfig, SortDirection, SortField } from '@/lib/types'
import { cn } from '@/lib/utils'

const m = _m!

const OPEN_GAP = 8
const CORNER_RADIUS = 12
const GAP_SPRING = { stiffness: 200, damping: 28, mass: 1 } as SpringOptions
const ICON_SPRING = { stiffness: 200, damping: 28 } as SpringOptions
const SWAY_SPRING = { stiffness: 200, damping: 24 } as SpringOptions

type PopoverStyle = {
  cornerRadius?: number
  cornerSmoothing?: number
  paddingTop?: number
  paddingLeft?: number
  paddingRight?: number
  paddingBottom?: number
  titleFontSize?: number
  titleTransform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none'
  titlePaddingX?: number
  titlePaddingTop?: number
  titlePaddingBottom?: number
  hoverPaddingX?: number
  hoverPaddingY?: number
  hoverBorderRadius?: number
}

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
  AddPopover?: PopoverStyle
  FieldPopover?: PopoverStyle
  Sorting?: {
    defaultSort?: string
    autoApply?: boolean
  }
}

export type SortPickerProps = {
  value: SortConfig
  onChange?: (value: SortConfig) => void
  defaultOpen?: boolean
  disabled?: boolean
  className?: string
  dial?: SortPickerDialValues
}

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

type SelectableFieldProps = {
  label: string
  icon?: string
  chevron?: boolean
  isPopoverOpen?: boolean
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

const SelectableField = React.forwardRef<HTMLButtonElement, SelectableFieldProps>(({
  label,
  icon,
  chevron,
  isPopoverOpen,
  onClick,
  isEditing,
  swayX,
  dial,
}, ref) => {
  const isDark = useIsDark()
  const c = dial?.Colors
  const t = dial?.Typography
  const [isHovered, setIsHovered] = useState(false)

  const textColor = isDark ? (c?.textColorDark ?? '#FFFFFF') : (c?.textColor ?? '#000000')
  const fontSize = t?.fontSize
  const fontWeight = t?.fontWeight
  const letterSpacing = t?.letterSpacing != null ? `${t.letterSpacing}px` : undefined
  const noWrap = t?.noWrap ?? true
  const showChevron = chevron && isEditing && (isPopoverOpen || isHovered)

  return (
    <m.button
      ref={ref}
      data-slot="sort-picker-field"
      type="button"
      onClick={onClick}
      disabled={!isEditing}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        x: swayX,
        color: textColor,
        ...(fontSize != null ? { fontSize } : {}),
        ...(fontWeight != null ? { fontWeight } : {}),
        ...(letterSpacing != null ? { letterSpacing } : {}),
        ...(noWrap ? { whiteSpace: 'nowrap' as const } : {}),
      }}
      className="flex h-full w-full cursor-pointer items-center justify-center border-0 bg-transparent text-center font-semibold text-black outline-none disabled:cursor-default dark:text-white focus-visible:bg-black/5 dark:focus-visible:bg-white/10"
    >
      {icon && <span className="text-sm">{icon}</span>}
      <span>{label}</span>
      {chevron && isEditing && (
        <m.span
          animate={{
            width: showChevron ? 18 : 0,
            opacity: showChevron ? 1 : 0,
            marginLeft: showChevron ? 4 : 0,
            rotate: isPopoverOpen ? 180 : 0,
          }}
          transition={{ type: 'spring', stiffness: 520, damping: 38 }}
          style={{ overflow: 'hidden', display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}
        >
          <HugeiconsIcon icon={ChevronDownIcon} size={dial?.Layout?.iconSize ?? 18} color="currentColor" strokeWidth={dial?.Layout?.iconStrokeWidth ?? 2.5} />
        </m.span>
      )}
    </m.button>
  )
})
SelectableField.displayName = 'SelectableField'

import { Popover, PopoverTrigger, PopoverContent } from '@/components/animate-ui/components/radix/popover'



function SortPicker({
  value,
  onChange,
  defaultOpen = false,
  disabled = false,
  className,
  dial,
}: SortPickerProps) {
  const [isEditing, setIsEditing] = useState(defaultOpen)
  const [localRules, setLocalRules] = useState<SortConfig>(value)
  const [openFieldMenuIndex, setOpenFieldMenuIndex] = useState<number | null>(null)
  const allFieldsUsed = localRules.length >= SORT_FIELDS.length

  useEffect(() => {
    if (!isEditing) setLocalRules(value)
  }, [value, isEditing])

  const shouldReduceMotion = useReducedMotion()
  const isDark = useIsDark()

  const l = dial?.Layout
  const motionConfig = dial?.Motion
  const c = dial?.Colors
  const i = dial?.Interaction
  const ap = dial?.AddPopover
  const fp = dial?.FieldPopover

  const openGapVal = l?.openGap ?? OPEN_GAP
  const cornerRadiusVal = l?.cornerRadius ?? CORNER_RADIUS
  const segHeight = l?.segmentHeight
  const segPadX = l?.segmentPaddingX
  const toggleW = l?.toggleButtonWidth
  const iconSz = l?.iconSize ?? 18
  const iconStrokeVal = l?.iconStrokeWidth ?? 2.5
  const cornerSm = l?.cornerSmoothing ?? 1

  const addPopoverCornerRadius = ap?.cornerRadius ?? 14
  const addPopoverPaddingTop = ap?.paddingTop ?? 4
  const addPopoverPaddingLeft = ap?.paddingLeft ?? 4
  const addPopoverPaddingRight = ap?.paddingRight ?? 4
  const addPopoverPaddingBottom = ap?.paddingBottom ?? 4
  const addPopoverTitleFontSize = ap?.titleFontSize ?? 12
  const addPopoverTitleTransform = ap?.titleTransform ?? 'capitalize'
  const addPopoverHoverPaddingX = ap?.hoverPaddingX ?? 12
  const addPopoverHoverPaddingY = ap?.hoverPaddingY ?? 4
  const addPopoverHoverBorderRadius = ap?.hoverBorderRadius ?? 12
  const addPopoverTitlePaddingX = ap?.titlePaddingX ?? 12
  const addPopoverTitlePaddingTop = ap?.titlePaddingTop ?? 6
  const addPopoverTitlePaddingBottom = ap?.titlePaddingBottom ?? 2

  const fieldPopoverCornerRadius = fp?.cornerRadius ?? 14
  const fieldPopoverPaddingTop = fp?.paddingTop ?? 4
  const fieldPopoverPaddingLeft = fp?.paddingLeft ?? 4
  const fieldPopoverPaddingRight = fp?.paddingRight ?? 4
  const fieldPopoverPaddingBottom = fp?.paddingBottom ?? 4
  const fieldPopoverTitleFontSize = fp?.titleFontSize ?? 12
  const fieldPopoverTitleTransform = fp?.titleTransform ?? 'capitalize'
  const fieldPopoverHoverPaddingX = fp?.hoverPaddingX ?? 12
  const fieldPopoverHoverPaddingY = fp?.hoverPaddingY ?? 4
  const fieldPopoverHoverBorderRadius = fp?.hoverBorderRadius ?? 12
  const fieldPopoverTitlePaddingX = fp?.titlePaddingX ?? 12
  const fieldPopoverTitlePaddingTop = fp?.titlePaddingTop ?? 6
  const fieldPopoverTitlePaddingBottom = fp?.titlePaddingBottom ?? 2

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

  useEffect(() => { ogMotion.set(openGapVal) }, [openGapVal, ogMotion])
  useEffect(() => { crMotion.set(cornerRadiusVal) }, [cornerRadiusVal, crMotion])

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

  const changeField = useCallback((ruleIndex: number, newField: SortField) => {
    setLocalRules((prev) => {
      const currentField = prev[ruleIndex].field
      if (newField === currentField) return prev

      const otherIndex = prev.findIndex((r, i) => i !== ruleIndex && r.field === newField)

      if (otherIndex === -1) {
        const next = [...prev]
        next[ruleIndex] = { field: newField, direction: prev[ruleIndex].direction }
        return next
      }

      const next = [...prev]
      const temp = next[ruleIndex]
      next[ruleIndex] = next[otherIndex]
      next[otherIndex] = temp
      return next
    })
  }, [])

  const removeField = useCallback((ruleIndex: number) => {
    setLocalRules((prev) => {
      if (prev.length <= 1) {
        return [{ field: "bookmarkedAt", direction: "desc" }] as SortConfig
      }
      return prev.filter((_, i) => i !== ruleIndex)
    })
  }, [])

  const cycleDirection = useCallback((ruleIndex: number) => {
    setLocalRules((prev) => {
      const rule = prev[ruleIndex]
      const dirs = getFieldDirectionOptions(rule.field)
      const idx = dirs.findIndex(d => d.value === rule.direction)
      const next = dirs[(idx + 1) % dirs.length].value
      const nextRules = [...prev]
      nextRules[ruleIndex] = { ...rule, direction: next }
      return nextRules
    })
  }, [])

  const addField = useCallback((field: SortField) => {
    setLocalRules((prev) => [...prev, { field, direction: getDefaultDirection(field) }])
  }, [])

  const toggleEdit = () => {
    if (disabled) return
    const next = !isEditing
    setIsEditing(next)
    if (!next) {
      onChange?.(localRules)
    }
  }

  const segBg = isDark ? (c?.segmentBgDark ?? '#262626') : (c?.segmentBg ?? '#F4F4F9')
  const iconColor = c?.iconColor ?? 'currentColor'
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
      {localRules.map((rule, i) => (
        <React.Fragment key={rule.field}>
          <SquircleSegment
            leftRadius={i === 0 ? cornerRadiusVal : innerRadius}
            rightRadius={innerRadius}
            cornerSmoothing={cornerSm}
            className="flex shrink-0 h-12 items-center px-3 bg-[#F4F4F9] dark:bg-[#262626]"
            style={i > 0 ? { marginLeft: segmentSpacing, ...segmentStyle } : segmentStyle}
          >
            <Popover open={openFieldMenuIndex === i} onOpenChange={(open) => setOpenFieldMenuIndex(open ? i : null)}>
              <PopoverTrigger asChild>
                <SelectableField
                  label={getFieldLabel(rule.field)}
                  chevron
                  isPopoverOpen={openFieldMenuIndex === i}
                  onClick={() => {}}
                  isEditing={isEditing}
                  swayX={swayX}
                  dial={dial}
                />
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={8}
                className="overlay-pop min-w-[180px] w-auto border-0"
                style={{
                  backgroundColor: segBg,
                  borderRadius: `${fieldPopoverCornerRadius}px`,
                  padding: `${fieldPopoverPaddingTop}px ${fieldPopoverPaddingRight}px ${fieldPopoverPaddingBottom}px ${fieldPopoverPaddingLeft}px`,
                }}
              >
                <div className="flex flex-col gap-1" style={{ maxHeight: '320px' }}>
                  <div
                    className="flex-shrink-0 font-medium text-muted-foreground/60 tracking-wider"
                    style={{ padding: `${fieldPopoverTitlePaddingTop}px ${fieldPopoverTitlePaddingX}px ${fieldPopoverTitlePaddingBottom}px`, fontSize: fieldPopoverTitleFontSize, textTransform: fieldPopoverTitleTransform }}
                  >
                    Select field
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="flex flex-col gap-1">
                      {SORT_FIELDS.map((f) => {
                        const otherIndex = localRules.findIndex((r, j) => j !== i && r.field === f.value)
                        const isCurrent = f.value === rule.field
                        return (
                          <button
                            type="button"
                            key={f.value}
                            onClick={() => {
                              changeField(i, f.value)
                              setOpenFieldMenuIndex(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                changeField(i, f.value)
                                setOpenFieldMenuIndex(null)
                              }
                            }}
                            className="flex w-full items-center gap-2 text-left text-sm font-medium outline-none min-h-[36px] cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10 focus-visible:bg-black/5 dark:focus-visible:bg-white/10"
                            style={{
                              padding: `${fieldPopoverHoverPaddingY}px ${fieldPopoverHoverPaddingX}px`,
                              borderRadius: `${fieldPopoverHoverBorderRadius}px`,
                              color: isCurrent
                                ? (isDark ? '#FFFFFF' : '#000000')
                                : otherIndex !== -1
                                  ? (isDark ? '#888888' : 'currentColor')
                                  : (isDark ? '#FFFFFF' : '#000000'),
                            }}
                          >
                            {isCurrent && <HugeiconsIcon icon={CheckIcon} size={iconSz} color="currentColor" strokeWidth={iconStrokeVal} />}
                            {!isCurrent && otherIndex !== -1 && <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} size={iconSz} color="currentColor" strokeWidth={iconStrokeVal} />}
                            <span>{f.label}</span>
                            {otherIndex !== -1 && !isCurrent && <span className="ml-auto text-[11px] text-muted-foreground/60">Used</span>}
                          </button>
                        )
                      })}
                      {localRules.length > 1 && (
                        <>
                          <div className="border-t border-border mx-3" />
                          <button
                            type="button"
                            onClick={() => {
                              removeField(i)
                              setOpenFieldMenuIndex(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                removeField(i)
                                setOpenFieldMenuIndex(null)
                              }
                            }}
                            className="flex w-full items-center gap-2 text-left text-sm font-medium outline-none min-h-[36px] cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10 focus-visible:bg-black/5 dark:focus-visible:bg-white/10"
                            style={{
                              padding: `${fieldPopoverHoverPaddingY}px ${fieldPopoverHoverPaddingX}px`,
                              borderRadius: `${fieldPopoverHoverBorderRadius}px`,
                              color: isDark ? '#FFFFFF' : '#000000',
                            }}
                          >
                            <HugeiconsIcon icon={Delete01Icon} size={iconSz} color="currentColor" strokeWidth={iconStrokeVal} />
                            <span>Remove</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </SquircleSegment>
          <SquircleSegment
            leftRadius={innerRadius}
            rightRadius={innerRadius}
            cornerSmoothing={cornerSm}
            style={{ marginLeft: segmentSpacing, ...segmentStyle }}
            className="flex shrink-0 h-12 items-center justify-center px-3 bg-[#F4F4F9] dark:bg-[#262626]"
          >
            <m.button
              type="button"
              onClick={() => cycleDirection(i)}
              disabled={!isEditing}
              aria-label="Toggle sort direction"
              className="flex h-full w-full cursor-pointer items-center justify-center border-0 bg-transparent outline-none disabled:cursor-default focus-visible:bg-black/5 dark:focus-visible:bg-white/10"
              style={{ color: iconColor, x: swayX }}
            >
              <HugeiconsIcon
                icon={getDirectionArrow(rule.field, rule.direction) === "ArrowDownDoubleIcon" ? ArrowDownDoubleIcon : ArrowUpDoubleIcon}
                size={iconSz}
                color={iconColor}
                strokeWidth={iconStrokeVal}
              />
            </m.button>
          </SquircleSegment>
        </React.Fragment>
      ))}
      <Popover>
        <SquircleSegment asChild
          leftRadius={innerRadius}
          rightRadius={innerRadius}
          cornerSmoothing={cornerSm}
          style={{ marginLeft: segmentSpacing, ...segmentStyle }}
          className="flex shrink-0 h-12 items-center justify-center bg-[#F4F4F9] dark:bg-[#262626]"
        >
          <PopoverTrigger asChild>
            <button
              data-slot="sort-picker-add"
              type="button"
              disabled={!isEditing || allFieldsUsed}
              aria-label="Add sort rule"
              style={{
                ...(segHeight != null ? { height: segHeight } : {}),
                width: '32px',
                backgroundColor: segBg,
                cursor: isEditing ? 'pointer' : 'default',
              }}
              className="flex shrink-0 h-12 w-8 items-center justify-center border-0 bg-transparent text-muted-foreground/60 outline-none disabled:opacity-40 focus-visible:bg-black/5 dark:focus-visible:bg-white/10"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={iconSz} color="currentColor" strokeWidth={iconStrokeVal} />
            </button>
          </PopoverTrigger>
        </SquircleSegment>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="overlay-pop min-w-[160px] border-0"
          style={{
            backgroundColor: segBg,
            borderRadius: `${addPopoverCornerRadius}px`,
            padding: `${addPopoverPaddingTop}px ${addPopoverPaddingRight}px ${addPopoverPaddingBottom}px ${addPopoverPaddingLeft}px`,
          }}
        >
            <div className="flex flex-col gap-1">
              <div
                className="font-medium text-muted-foreground/60 tracking-wider"
                style={{ padding: `${addPopoverTitlePaddingTop}px ${addPopoverTitlePaddingX}px ${addPopoverTitlePaddingBottom}px`, fontSize: addPopoverTitleFontSize, textTransform: addPopoverTitleTransform }}
              >
                Add sort
              </div>
              {(() => {
                const usedFields = new Set(localRules.map(r => r.field))
                return SORT_FIELDS.map((f) => {
                  const isUsed = usedFields.has(f.value)
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => {
                        if (isUsed) return
                        addField(f.value)
                        setIsEditing(true)
                      }}
                      disabled={isUsed}
                      className="flex w-full items-center gap-2 text-left text-sm font-medium outline-none transition-colors hover:bg-black/5 dark:hover:bg-white/10 focus-visible:bg-black/5 dark:focus-visible:bg-white/10"
                      style={{
                        padding: `${addPopoverHoverPaddingY}px ${addPopoverHoverPaddingX}px`,
                        borderRadius: `${addPopoverHoverBorderRadius}px`,
                        color: isDark ? '#FFFFFF' : '#000000',
                        opacity: isUsed ? 0.4 : 1,
                        cursor: isUsed ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <span>{f.label}</span>
                      {isUsed && (
                        <span className="ml-auto text-[11px] text-muted-foreground/60">Added</span>
                      )}
                    </button>
                  )
                })
              })()}
            </div>
          </PopoverContent>
        </Popover>
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
            className="flex shrink-0 h-12 w-12 items-center justify-center bg-muted transition-transform active:scale-[0.96] disabled:active:scale-100"
          >
            <div className="relative" style={{ width: iconSz, height: iconSz }}>
              <m.div
                style={{ opacity: useTransform(iconProgress, [0, 0.5], [1, 0]), position: 'absolute', inset: 0 }}
              >
                <HugeiconsIcon icon={Edit01Icon} size={iconSz} color={iconColor} strokeWidth={iconStrokeVal} />
              </m.div>
              <m.div
                style={{ opacity: useTransform(iconProgress, [0.5, 1], [0, 1]), position: 'absolute', inset: 0 }}
              >
                <HugeiconsIcon icon={CheckIcon} size={iconSz} color={iconColor} strokeWidth={iconStrokeVal} />
              </m.div>
            </div>
          </button>
      </SquircleSegment>
    </m.div>
    </LazyMotion>
  )
}

export { SortPicker }
export default SortPicker
