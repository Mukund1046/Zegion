'use client'

import { useEffect, useState, useCallback } from "react"
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon, ArrowDataTransferHorizontalIcon, Delete01Icon, CheckIcon, ChevronDownIcon, ArrowDownDoubleIcon, ArrowUpDoubleIcon } from '@hugeicons/core-free-icons'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/animate-ui/components/radix/popover'

import {
  DEFAULT_SORT,
  getDefaultDirection,
  getDirectionArrow,
  getFieldDirectionOptions,
  getFieldLabel,
  SORT_FIELDS,
} from '@/lib/bookmark-utils'
import type { SortConfig, SortDirection, SortField } from '@/lib/types'

type PopoverStyle = {
  minWidth?: number
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

export type MobileSortPickerDial = {
  Colors?: {
    segmentBg?: string
    segmentBgDark?: string
    textColor?: string
    textColorDark?: string
    iconColor?: string
  }
  Typography?: {
    fontSize?: number
    fontWeight?: string
    letterSpacing?: number
    noWrap?: boolean
  }
  AddPopover?: PopoverStyle
  FieldPopover?: PopoverStyle
}

export type MobileSortPickerProps = {
  value: SortConfig
  onChange?: (value: SortConfig) => void
  onClose?: () => void
  dial?: MobileSortPickerDial
  rowGap?: number
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

export default function MobileSortPicker({ value, onChange, onClose, dial, rowGap = 4 }: MobileSortPickerProps) {
  const [rules, setRules] = useState<SortConfig>(value)
  const isDark = useIsDark()

  const c = dial?.Colors
  const t = dial?.Typography
  const fp = dial?.FieldPopover
  const ap = dial?.AddPopover
  const segBg = isDark ? (c?.segmentBgDark ?? '#262626') : (c?.segmentBg ?? '#F4F4F9')
  const textColor = isDark ? (c?.textColorDark ?? '#FFFFFF') : (c?.textColor ?? '#000000')
  const iconCol = c?.iconColor ?? 'currentColor'
  const fontSize = t?.fontSize
  const fontWeight = t?.fontWeight
  const hoverRad = fp?.hoverBorderRadius ?? 12
  const hoverPadX = fp?.hoverPaddingX ?? 12
  const hoverPadY = fp?.hoverPaddingY ?? 4

  const fieldPopoverCornerRadius = fp?.cornerRadius ?? 14
  const fieldPopoverMinWidth = fp?.minWidth ?? 168
  const fieldPopoverPaddingTop = fp?.paddingTop ?? 4
  const fieldPopoverPaddingLeft = fp?.paddingLeft ?? 4
  const fieldPopoverPaddingRight = fp?.paddingRight ?? 4
  const fieldPopoverPaddingBottom = fp?.paddingBottom ?? 4

  const addPopoverCornerRadius = ap?.cornerRadius ?? 14
  const addPopoverMinWidth = ap?.minWidth ?? 168
  const addPopoverPaddingTop = ap?.paddingTop ?? 4
  const addPopoverPaddingLeft = ap?.paddingLeft ?? 4
  const addPopoverPaddingRight = ap?.paddingRight ?? 4
  const addPopoverPaddingBottom = ap?.paddingBottom ?? 4
  const addPopoverHoverPaddingX = ap?.hoverPaddingX ?? 12
  const addPopoverHoverPaddingY = ap?.hoverPaddingY ?? 4
  const addPopoverHoverBorderRadius = ap?.hoverBorderRadius ?? 12

  const changeField = useCallback((ruleIndex: number, newField: SortField) => {
    setRules((prev) => {
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
    setRules((prev) => {
      if (prev.length <= 1) return [{ field: "bookmarkedAt", direction: "desc" }] as SortConfig
      return prev.filter((_, i) => i !== ruleIndex)
    })
  }, [])

  const cycleDirection = useCallback((ruleIndex: number) => {
    setRules((prev) => {
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
    setRules((prev) => [...prev, { field, direction: getDefaultDirection(field) }])
  }, [])

  const [addOpen, setAddOpen] = useState(false)
  const [openFieldMenuIndex, setOpenFieldMenuIndex] = useState<number | null>(null)
  const allFieldsUsed = rules.length >= SORT_FIELDS.length
  const usedFields = new Set(rules.map(r => r.field))

  const done = () => {
    onChange?.(rules)
    onClose?.()
  }

  return (
    <div
      className="flex flex-col"
      style={{ color: textColor, fontSize }}
    >
      <div className="flex items-center justify-between" style={{ padding: `${hoverPadY}px ${hoverPadX}px` }}>
        <span className="text-sm font-semibold" style={{ color: textColor, fontWeight: fontWeight || 600 }}>Sort by</span>
        <button
          type="button"
          onClick={done}
          aria-label="Apply sort"
          className="group flex items-center justify-center w-8 h-8 transition-colors cursor-pointer hover:bg-black/5 dark:hover:bg-white/10"
          style={{ borderRadius: hoverRad }}
        >
          <HugeiconsIcon icon={CheckIcon} size={18} color={iconCol} strokeWidth={2.5}
            className="transition-colors group-hover:text-black dark:group-hover:text-white"
          />
        </button>
      </div>
      <div className="border-t" style={{ borderColor: 'var(--border)', marginLeft: hoverPadX, marginRight: hoverPadX }} />
      <div className="flex flex-col max-h-[50vh] overflow-y-auto" style={{ gap: rowGap }}>
        {rules.map((rule, i) => (
          <div key={rule.field} className="flex items-center gap-2 transition-colors hover:bg-black/5 dark:hover:bg-white/10" style={{ borderRadius: hoverRad, background: i % 2 === 1 ? segBg : 'transparent', padding: `${hoverPadY}px ${hoverPadX}px` }}>
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Popover open={openFieldMenuIndex === i} onOpenChange={(open) => setOpenFieldMenuIndex(open ? i : null)}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Sort field"
                    className="flex w-full min-w-0 items-center gap-1 bg-transparent border-0 outline-none cursor-pointer"
                    style={{ color: textColor, minHeight: 32, borderRadius: hoverRad, paddingLeft: 6, paddingRight: 6, fontWeight: fontWeight || 600, fontSize }}
                  >
                    <span className="truncate">{getFieldLabel(rule.field)}</span>
                    <span
                      className="inline-flex shrink-0 items-center"
                      style={{ transform: openFieldMenuIndex === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
                    >
                      <HugeiconsIcon icon={ChevronDownIcon} size={14} strokeWidth={2} color={iconCol} />
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="start"
                  sideOffset={6}
                  avoidCollisions
                  className="overlay-pop border-0"
                  style={{
                    borderRadius: fieldPopoverCornerRadius,
                    backgroundColor: segBg,
                    padding: `${fieldPopoverPaddingTop}px ${fieldPopoverPaddingRight}px ${fieldPopoverPaddingBottom}px ${fieldPopoverPaddingLeft}px`,
                    minWidth: fieldPopoverMinWidth,
                  }}
                >
                  <div className="flex flex-col" style={{ gap: 2 }}>
                    {SORT_FIELDS.map((f) => {
                      const isCurrent = f.value === rule.field
                      const isUsed = !isCurrent && usedFields.has(f.value)
                      return (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => { changeField(i, f.value); setOpenFieldMenuIndex(null) }}
                          className="flex w-full items-center gap-2 text-left text-xs font-medium outline-none transition-colors hover:bg-black/5 dark:hover:bg-white/10 focus-visible:bg-black/5 dark:focus-visible:bg-white/10"
                          style={{
                            padding: `${fp?.hoverPaddingY ?? 4}px ${fp?.hoverPaddingX ?? 12}px`,
                            borderRadius: hoverRad,
                            minHeight: 40,
                            color: isCurrent ? textColor : isUsed ? 'var(--muted-foreground)' : textColor,
                          }}
                        >
                          <span className="flex shrink-0 items-center" style={{ width: 14 }}>
                            {isCurrent && <HugeiconsIcon icon={CheckIcon} size={14} strokeWidth={2.5} color={iconCol} />}
                            {isUsed && <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} size={14} strokeWidth={2} color={iconCol} />}
                          </span>
                          <span className="flex-1 min-w-0 truncate">{f.label}</span>
                          {isUsed && <span className="ml-auto text-[11px] text-muted-foreground/60">Used</span>}
                        </button>
                      )
                    })}
                    {rules.length > 1 && (
                      <>
                        <div className="border-t border-border" style={{ marginLeft: fp?.hoverPaddingX ?? 12, marginRight: fp?.hoverPaddingX ?? 12, marginTop: 4, marginBottom: 4 }} />
                        <button
                          type="button"
                          onClick={() => { removeField(i); setOpenFieldMenuIndex(null) }}
                          className="flex w-full items-center gap-2 text-left text-xs font-medium outline-none transition-colors hover:bg-black/5 dark:hover:bg-white/10 focus-visible:bg-black/5 dark:focus-visible:bg-white/10"
                          style={{ padding: `${fp?.hoverPaddingY ?? 4}px ${fp?.hoverPaddingX ?? 12}px`, borderRadius: hoverRad, minHeight: 40, color: textColor }}
                        >
                          <span className="flex shrink-0 items-center" style={{ width: 14 }}>
                            <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={2} color={iconCol} />
                          </span>
                          <span>Remove</span>
                        </button>
                      </>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <button
              type="button"
              onClick={() => cycleDirection(i)}
              aria-label="Toggle direction"
              className="flex items-center justify-center w-7 h-7 transition-colors shrink-0 cursor-pointer hover:bg-black/5 dark:hover:bg-white/10"
              style={{ borderRadius: hoverRad, color: iconCol }}
            >
              <HugeiconsIcon icon={getDirectionArrow(rule.field, rule.direction) === "ArrowDownDoubleIcon" ? ArrowDownDoubleIcon : ArrowUpDoubleIcon} size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => removeField(i)}
              aria-label="Remove sort rule"
              className="flex items-center justify-center w-7 h-7 transition-colors shrink-0 cursor-pointer group hover:bg-black/5 dark:hover:bg-white/10"
              style={{ borderRadius: hoverRad, color: iconCol }}
            >
              <span className="group-hover:text-red-500 transition-colors flex items-center justify-center">
                <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={2} />
              </span>
            </button>
          </div>
        ))}
      </div>
      <div className="border-t" style={{ borderColor: 'var(--border)', marginLeft: hoverPadX, marginRight: hoverPadX }} />
      <div className="flex flex-col" style={{ gap: rowGap }}>
        {!allFieldsUsed && (
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2 transition-colors text-sm font-medium cursor-pointer hover:bg-black/5 dark:hover:bg-white/10"
                style={{ borderRadius: hoverRad, color: iconCol, padding: `${hoverPadY}px ${hoverPadX}px` }}
              >
                <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} color={iconCol} />
                Add rule
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={6}
              avoidCollisions
              className="overlay-pop border-0"
              style={{
                borderRadius: addPopoverCornerRadius,
                backgroundColor: segBg,
                padding: `${addPopoverPaddingTop}px ${addPopoverPaddingRight}px ${addPopoverPaddingBottom}px ${addPopoverPaddingLeft}px`,
                minWidth: addPopoverMinWidth,
              }}
            >
              <div className="flex flex-col" style={{ gap: 2 }}>
                {SORT_FIELDS.map((f) => {
                  const isUsed = usedFields.has(f.value)
                  return (
                    <button
                      key={f.value}
                      type="button"
                      disabled={isUsed}
                      onClick={() => { addField(f.value); setAddOpen(false) }}
                      className="flex w-full items-center gap-2 text-left text-xs font-medium outline-none transition-colors hover:bg-black/5 dark:hover:bg-white/10 focus-visible:bg-black/5 dark:focus-visible:bg-white/10"
                      style={{
                        padding: `${addPopoverHoverPaddingY}px ${addPopoverHoverPaddingX}px`,
                        borderRadius: addPopoverHoverBorderRadius,
                        minHeight: 40,
                        color: textColor,
                        opacity: isUsed ? 0.4 : 1,
                        cursor: isUsed ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <span className="flex-1 min-w-0 truncate">{f.label}</span>
                      {isUsed && <span className="ml-auto text-[11px] text-muted-foreground/60">Added</span>}
                    </button>
                  )
                })}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  )
}
