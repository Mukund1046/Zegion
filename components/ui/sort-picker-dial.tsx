'use client'

import { useDialKitController } from "dialkit"
import { useCallback, useEffect, useRef, useState } from "react"

import type { SortConfig } from "@/lib/types"

import SortPicker from "./sort-picker"
import MobileSortPicker from "./mobile-sort-picker"
import { Popover, PopoverTrigger, PopoverContent } from '@/components/animate-ui/components/radix/popover'
import { HugeiconsIcon } from '@hugeicons/react'
import { Edit01Icon, CheckIcon } from '@hugeicons/core-free-icons'
import {
  SORT_PICKER_PANEL_ID,
  sortPickerDialConfig,
  sortPickerShortcuts,
} from "./sort-picker-dial-config"

export type SortPickerDialProps = {
  value: SortConfig
  onChange?: (value: SortConfig) => void
  defaultOpen?: boolean
  disabled?: boolean
  className?: string
  mobile?: boolean
}

export default function SortPickerDial({
  value,
  onChange,
  defaultOpen,
  disabled,
  className,
  mobile,
}: SortPickerDialProps) {
  const ctrlRef = useRef<ReturnType<typeof useDialKitController> | null>(null)

  const onAction = useCallback((action: string) => {
    const ctrl = ctrlRef.current
    if (!ctrl) return
    if (action === "Actions.replayAnimation") {
      return
    }
    if (action === "Actions.toggleEditMode") {
      return
    }
    if (action === "Actions.resetMotion") {
      ctrl.setValues({
        Motion: {
          gapSpringStiffness: 200,
          gapSpringDamping: 28,
          gapSpringMass: 1,
          iconSpringStiffness: 200,
          iconSpringDamping: 28,
          swaySpringStiffness: 200,
          swaySpringDamping: 24,
        },
      })
    }
    if (action === "Actions.resetLayout") {
      ctrl.setValues({
        Layout: {
          segmentHeight: 36,
          segmentPaddingX: 8,
          openGap: 8,
          toggleButtonWidth: 34,
          cornerRadius: 12,
          cornerSmoothing: 1,
          iconSize: 16,
          iconStrokeWidth: 2,
        },
      })
    }
    if (action === "Actions.resetPopover") {
      ctrl.setValues({
        AddPopover: {
          cornerRadius: 14,
          cornerSmoothing: 1,
          paddingTop: 4,
          paddingLeft: 4,
          paddingRight: 4,
          paddingBottom: 4,
          titleFontSize: 12,
          titleTransform: "capitalize",
          hoverPaddingX: 12,
          hoverPaddingY: 4,
          hoverBorderRadius: 12,
          titlePaddingX: 12,
          titlePaddingTop: 6,
          titlePaddingBottom: 2,
        },
        FieldPopover: {
          cornerRadius: 14,
          cornerSmoothing: 1,
          paddingTop: 4,
          paddingLeft: 4,
          paddingRight: 4,
          paddingBottom: 4,
          titleFontSize: 12,
          titleTransform: "capitalize",
          hoverPaddingX: 12,
          hoverPaddingY: 4,
          hoverBorderRadius: 12,
          titlePaddingX: 12,
          titlePaddingTop: 6,
          titlePaddingBottom: 2,
        },
      })
    }
    if (action === "Actions.restoreDefaults") {
      ctrl.resetValues()
    }
  }, [])

  const controller = useDialKitController(
    SORT_PICKER_PANEL_ID,
    sortPickerDialConfig,
    {
      persist: { key: "kairos-sort-picker" },
      shortcuts: sortPickerShortcuts,
      onAction,
    }
  )
  useEffect(() => { ctrlRef.current = controller }, [controller])

  const values = controller.values as unknown as {
    Motion: {
      gapSpringStiffness: number
      gapSpringDamping: number
      gapSpringMass: number
      iconSpringStiffness: number
      iconSpringDamping: number
      swaySpringStiffness: number
      swaySpringDamping: number
    }
    Layout: {
      segmentHeight: number
      segmentPaddingX: number
      openGap: number
      toggleButtonWidth: number
      cornerRadius: number
      cornerSmoothing: number
      iconSize: number
      iconStrokeWidth: number
      rowGap: number
    }
    Typography: {
      fontSize: number
      fontWeight: string
      letterSpacing: number
      noWrap: boolean
    }
    Interaction: {
      hoverScale: number
      pressScale: number
      disabledOpacity: number
      activeOpacity: number
    }
    Colors: {
      segmentBg: string
      segmentBgDark: string
      textColor: string
      textColorDark: string
      iconColor: string
      dashColor: string
      dashColorDark: string
      borderColor: string
    }
    AddPopover: {
      cornerRadius: number
      cornerSmoothing: number
      paddingTop: number
      paddingLeft: number
      paddingRight: number
      paddingBottom: number
      titleFontSize: number
      titleTransform: string
      hoverPaddingX: number
      hoverPaddingY: number
      hoverBorderRadius: number
      titlePaddingX: number
      titlePaddingTop: number
      titlePaddingBottom: number
    }
    FieldPopover: {
      cornerRadius: number
      cornerSmoothing: number
      paddingTop: number
      paddingLeft: number
      paddingRight: number
      paddingBottom: number
      titleFontSize: number
      titleTransform: string
      hoverPaddingX: number
      hoverPaddingY: number
      hoverBorderRadius: number
      titlePaddingX: number
      titlePaddingTop: number
      titlePaddingBottom: number
    }
    Sorting: {
      defaultSort: string
      autoApply: boolean
    }
  }

  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const check = () => setIsDark(document.body.classList.contains('dark-mode'))
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const iconSz = values.Layout.iconSize ?? 18
  const iconStrokeVal = values.Layout.iconStrokeWidth ?? 2.5
  const iconColor = values.Colors.iconColor ?? 'currentColor'
  const mobilePopover = values.AddPopover
  const mobileColors = values.Colors
  const segBg = isDark ? (mobileColors.segmentBgDark ?? '#262626') : (mobileColors.segmentBg ?? '#F4F4F9')
  const rowGap = values.Layout.rowGap ?? 4

  const [mobileOpen, setMobileOpen] = useState(false)

  if (mobile) {
    return (
      <Popover open={mobileOpen} onOpenChange={setMobileOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Change sort"
            className="action-pill"
          >
            <HugeiconsIcon icon={Edit01Icon} size={iconSz} color={iconColor} strokeWidth={iconStrokeVal} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          sideOffset={8}
          avoidCollisions
          className="border-0 shadow-lg"
          style={{
            borderRadius: mobilePopover.cornerRadius,
            backgroundColor: segBg,
            padding: `${mobilePopover.paddingTop}px ${mobilePopover.paddingRight}px ${mobilePopover.paddingBottom}px ${mobilePopover.paddingLeft}px`,
          }}
        >
          <MobileSortPicker
            value={value}
            onChange={onChange}
            onClose={() => setMobileOpen(false)}
            rowGap={rowGap}
            dial={{
              Colors: mobileColors,
              Typography: values.Typography,
              AddPopover: {
                ...mobilePopover,
                titleTransform: mobilePopover.titleTransform as 'uppercase' | 'lowercase' | 'capitalize' | 'none',
              },
              FieldPopover: {
                ...values.FieldPopover,
                titleTransform: values.FieldPopover.titleTransform as 'uppercase' | 'lowercase' | 'capitalize' | 'none',
              },
            }}
          />
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <SortPicker
      value={value}
      onChange={onChange}
      defaultOpen={defaultOpen}
      disabled={disabled}
      className={className}
      dial={{
        Motion: {
          gapSpringStiffness: values.Motion.gapSpringStiffness,
          gapSpringDamping: values.Motion.gapSpringDamping,
          gapSpringMass: values.Motion.gapSpringMass,
          iconSpringStiffness: values.Motion.iconSpringStiffness,
          iconSpringDamping: values.Motion.iconSpringDamping,
          swaySpringStiffness: values.Motion.swaySpringStiffness,
          swaySpringDamping: values.Motion.swaySpringDamping,
        },
        Layout: {
          segmentHeight: values.Layout.segmentHeight,
          segmentPaddingX: values.Layout.segmentPaddingX,
          openGap: values.Layout.openGap,
          toggleButtonWidth: values.Layout.toggleButtonWidth,
          cornerRadius: values.Layout.cornerRadius,
          cornerSmoothing: values.Layout.cornerSmoothing,
          iconSize: values.Layout.iconSize,
          iconStrokeWidth: values.Layout.iconStrokeWidth,
        },
        Typography: {
          fontSize: values.Typography.fontSize,
          fontWeight: values.Typography.fontWeight,
          letterSpacing: values.Typography.letterSpacing,
          noWrap: values.Typography.noWrap,
        },
        Interaction: {
          hoverScale: values.Interaction.hoverScale,
          pressScale: values.Interaction.pressScale,
          disabledOpacity: values.Interaction.disabledOpacity,
          activeOpacity: values.Interaction.activeOpacity,
        },
        Colors: {
          segmentBg: values.Colors.segmentBg,
          segmentBgDark: values.Colors.segmentBgDark,
          textColor: values.Colors.textColor,
          textColorDark: values.Colors.textColorDark,
          iconColor: values.Colors.iconColor,
          dashColor: values.Colors.dashColor,
          dashColorDark: values.Colors.dashColorDark,
          borderColor: values.Colors.borderColor,
        },
        AddPopover: {
          cornerRadius: values.AddPopover.cornerRadius,
          cornerSmoothing: values.AddPopover.cornerSmoothing,
          paddingTop: values.AddPopover.paddingTop,
          paddingLeft: values.AddPopover.paddingLeft,
          paddingRight: values.AddPopover.paddingRight,
          paddingBottom: values.AddPopover.paddingBottom,
          titleFontSize: values.AddPopover.titleFontSize,
          titleTransform: values.AddPopover.titleTransform as 'uppercase' | 'lowercase' | 'capitalize' | 'none',
          hoverPaddingX: values.AddPopover.hoverPaddingX,
          hoverPaddingY: values.AddPopover.hoverPaddingY,
          hoverBorderRadius: values.AddPopover.hoverBorderRadius,
          titlePaddingX: values.AddPopover.titlePaddingX,
          titlePaddingTop: values.AddPopover.titlePaddingTop,
          titlePaddingBottom: values.AddPopover.titlePaddingBottom,
        },
        FieldPopover: {
          cornerRadius: values.FieldPopover.cornerRadius,
          cornerSmoothing: values.FieldPopover.cornerSmoothing,
          paddingTop: values.FieldPopover.paddingTop,
          paddingLeft: values.FieldPopover.paddingLeft,
          paddingRight: values.FieldPopover.paddingRight,
          paddingBottom: values.FieldPopover.paddingBottom,
          titleFontSize: values.FieldPopover.titleFontSize,
          titleTransform: values.FieldPopover.titleTransform as 'uppercase' | 'lowercase' | 'capitalize' | 'none',
          hoverPaddingX: values.FieldPopover.hoverPaddingX,
          hoverPaddingY: values.FieldPopover.hoverPaddingY,
          hoverBorderRadius: values.FieldPopover.hoverBorderRadius,
          titlePaddingX: values.FieldPopover.titlePaddingX,
          titlePaddingTop: values.FieldPopover.titlePaddingTop,
          titlePaddingBottom: values.FieldPopover.titlePaddingBottom,
        },
        Sorting: {
          defaultSort: values.Sorting.defaultSort,
          autoApply: values.Sorting.autoApply,
        },
      }}
    />
  )
}
