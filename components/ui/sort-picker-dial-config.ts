import type { DialConfig, ShortcutConfig } from "dialkit";

export const SORT_PICKER_PANEL_ID = "sort-picker";

function r<T extends [number, number, number, number?]>(v: T): T {
  return v;
}

export const sortPickerDialConfig = {
  Motion: {
    gapSpringStiffness: r([1, 1, 500, 1]),
    gapSpringDamping: r([1, 1, 100, 1]),
    gapSpringMass: r([0.1, 0.1, 10, 0.1]),
    iconSpringStiffness: r([1, 1, 500, 1]),
    iconSpringDamping: r([1, 1, 100, 1]),
    swaySpringStiffness: r([1, 1, 500, 1]),
    swaySpringDamping: r([1, 1, 100, 1]),
  },
  Layout: {
    segmentHeight: r([36, 28, 64, 2]),
    segmentPaddingX: r([8, 4, 28, 2]),
    openGap: r([8, 0, 24, 1]),
    toggleButtonWidth: r([34, 24, 64, 2]),
    cornerRadius: r([12, 0, 24, 1]),
    cornerSmoothing: r([1, 0, 1, 0.05]),
    iconSize: r([16, 12, 32, 1]),
    iconStrokeWidth: r([2, 0, 4, 0.5]),
  },
  Typography: {
    fontSize: r([14, 11, 20, 1]),
    fontWeight: {
      type: "select" as const,
      options: [
        { value: "400", label: "Normal (400)" },
        { value: "500", label: "Medium (500)" },
        { value: "600", label: "Semibold (600)" },
        { value: "700", label: "Bold (700)" },
        { value: "800", label: "Extrabold (800)" },
      ],
      default: "500",
    },
    letterSpacing: r([0, 0, 4, 0.5]),
    noWrap: true,
  },
  Interaction: {
    hoverScale: r([1.05, 1, 1.15, 0.01]),
    pressScale: r([0.9, 0.8, 1, 0.01]),
    disabledOpacity: r([0.5, 0.1, 1, 0.05]),
    activeOpacity: r([1, 0.3, 1, 0.05]),
  },
  Colors: {
    segmentBg: { type: "color" as const, default: "#F4F4F9" },
    segmentBgDark: { type: "color" as const, default: "#262626" },
    textColor: { type: "color" as const, default: "#000000" },
    textColorDark: { type: "color" as const, default: "#FFFFFF" },
    iconColor: { type: "color" as const, default: "#868593" },
    dashColor: { type: "color" as const, default: "#F4F4F9" },
    dashColorDark: { type: "color" as const, default: "#262626" },
    borderColor: { type: "color" as const, default: "transparent" },
  },
  Sorting: {
    defaultSort: {
      type: "select" as const,
      options: [
        { value: "recent", label: "Most recent" },
        { value: "oldest", label: "Oldest first" },
        { value: "liked", label: "Most liked" },
      ],
      default: "recent",
    },
    autoApply: true,
  },
  Actions: {
    replayAnimation: { type: "action" as const, label: "Replay Animation" },
    toggleEditMode: { type: "action" as const, label: "Toggle Edit Mode" },
    resetMotion: { type: "action" as const, label: "Reset Motion" },
    resetLayout: { type: "action" as const, label: "Reset Layout" },
    restoreDefaults: { type: "action" as const, label: "Restore All Defaults" },
  },
} satisfies DialConfig;

export const sortPickerShortcuts: Record<string, ShortcutConfig> = {
  replayAnimation: {
    key: "r",
    modifier: "alt",
    mode: "fine",
    interaction: "scroll",
  },
  toggleEditMode: {
    key: "e",
    modifier: "alt",
    mode: "fine",
    interaction: "scroll",
  },
  resetMotion: {
    key: "m",
    modifier: "alt",
    mode: "fine",
    interaction: "scroll",
  },
  resetLayout: {
    key: "l",
    modifier: "alt",
    mode: "fine",
    interaction: "scroll",
  },
  restoreDefaults: {
    key: "d",
    modifier: "alt",
    mode: "fine",
    interaction: "scroll",
  },
};
