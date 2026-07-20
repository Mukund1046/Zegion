'use client'

import { useDialKitController } from "dialkit"
import { useCallback, useEffect, useRef } from "react"

import type { SortMode } from "@/lib/types"

import SortPicker from "./sort-picker"
import {
  SORT_PICKER_PANEL_ID,
  sortPickerDialConfig,
  sortPickerShortcuts,
} from "./sort-picker-dial-config"

export type SortPickerDialProps = {
  value: SortMode
  onChange?: (value: SortMode) => void
  defaultOpen?: boolean
  disabled?: boolean
  className?: string
}

export default function SortPickerDial({
  value,
  onChange,
  defaultOpen,
  disabled,
  className,
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
          gapSpringStiffness: 1,
          gapSpringDamping: 1,
          gapSpringMass: 0.1,
          iconSpringStiffness: 1,
          iconSpringDamping: 1,
          swaySpringStiffness: 1,
          swaySpringDamping: 1,
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
    Sorting: {
      defaultSort: string
      autoApply: boolean
    }
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
        Sorting: {
          defaultSort: values.Sorting.defaultSort,
          autoApply: values.Sorting.autoApply,
        },
      }}
    />
  )
}
