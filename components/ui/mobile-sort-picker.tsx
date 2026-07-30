'use client'

import { useEffect, useState, useCallback } from "react"
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon, ArrowDataTransferHorizontalIcon, Delete01Icon, CheckIcon, ArrowDownDoubleIcon, ArrowUpDoubleIcon } from '@hugeicons/core-free-icons'

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
  const segBg = isDark ? (c?.segmentBgDark ?? '#262626') : (c?.segmentBg ?? '#F4F4F9')
  const textColor = isDark ? (c?.textColorDark ?? '#FFFFFF') : (c?.textColor ?? '#000000')
  const iconCol = c?.iconColor ?? 'currentColor'
  const fontSize = t?.fontSize
  const fontWeight = t?.fontWeight
  const hoverRad = fp?.hoverBorderRadius ?? 12
  const hoverPadX = fp?.hoverPaddingX ?? 12
  const hoverPadY = fp?.hoverPaddingY ?? 4

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
  const allFieldsUsed = rules.length >= SORT_FIELDS.length
  const usedFields = new Set(rules.map(r => r.field))
  const availableFields = SORT_FIELDS.filter(f => !usedFields.has(f.value))

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
              <select
                aria-label="Sort field"
                value={rule.field}
                onChange={(e) => changeField(i, e.target.value as SortField)}
                className="flex-1 min-w-0 text-sm font-medium bg-transparent border-0 outline-none cursor-pointer focus-visible:bg-black/5 dark:focus-visible:bg-white/10"
                style={{ color: textColor, WebkitAppearance: 'none', MozAppearance: 'none', fontWeight: fontWeight || 600 }}
              >
                {SORT_FIELDS.map((f) => {
                  const isCurrent = f.value === rule.field
                  const isUsed = !isCurrent && usedFields.has(f.value)
                  return (
                    <option key={f.value} value={f.value} disabled={isUsed}>
                      {f.label}{isUsed ? ' (used)' : ''}
                    </option>
                  )
                })}
              </select>
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
        {!allFieldsUsed && availableFields.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setAddOpen(!addOpen)}
              className="flex w-full items-center gap-2 transition-colors text-sm font-medium cursor-pointer hover:bg-black/5 dark:hover:bg-white/10"
              style={{ borderRadius: hoverRad, color: iconCol, padding: `${hoverPadY}px ${hoverPadX}px` }}
            >
              <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} color={iconCol} />
              Add rule
            </button>
            {addOpen && (
              <div className="flex flex-col" style={{ gap: rowGap, marginLeft: hoverPadX + 16, marginTop: rowGap }}>
                {availableFields.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => { addField(f.value); setAddOpen(false) }}
                    className="flex items-center gap-2 transition-colors text-sm text-left cursor-pointer hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ borderRadius: hoverRad, color: textColor, padding: `${hoverPadY}px ${hoverPadX}px` }}
                  >
                    <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} size={14} strokeWidth={2} color={iconCol} />
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
