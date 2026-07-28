import type { DialConfig } from "dialkit";

function r<T extends [number, number, number, number?]>(v: T): T {
  return v;
}

export const syncSettingsDialConfig = {
  Card: {
    paddingX: r([16, 4, 32, 1]),
    paddingY: r([16, 4, 32, 1]),
    borderRadius: r([12, 0, 24, 1]),
    cardBg: { type: "color" as const, default: "var(--popover)" },
    cardGap: r([16, 4, 32, 1]),
  },
  CloseBtn: {
    btnBg: { type: "color" as const, default: "transparent" },
    btnHoverBg: { type: "color" as const, default: "var(--muted)" },
    iconColor: { type: "color" as const, default: "var(--muted-foreground)" },
    iconSize: r([16, 10, 28, 1]),
    btnSize: r([28, 20, 40, 1]),
    btnTop: r([8, 0, 20, 1]),
    btnRight: r([8, 0, 20, 1]),
  },
  Header: {
    titleSize: r([16, 12, 24, 1]),
    descriptionSize: r([14, 10, 20, 1]),
    headerGap: r([8, 2, 20, 1]),
  },
  RadioRow: {
    radioGap: r([12, 4, 24, 1]),
    labelSize: r([14, 11, 20, 1]),
    subtitleSize: r([12, 9, 16, 1]),
    indentLeft: r([28, 16, 48, 1]),
    optionGap: r([8, 2, 20, 1]),
  },
  Input: {
    height: r([32, 24, 48, 1]),
    borderRadius: r([6, 0, 16, 1]),
    paddingX: r([10, 4, 20, 1]),
    fontSize: r([14, 10, 20, 1]),
    inputGap: r([6, 2, 16, 1]),
    noteSize: r([11, 9, 16, 1]),
    dropdownWidth: r([160, 100, 320, 5]),
  },
  Status: {
    paddingX: r([12, 4, 24, 1]),
    paddingY: r([6, 2, 16, 1]),
    borderRadius: r([6, 0, 16, 1]),
    fontSize: r([12, 9, 16, 1]),
  },
  Footer: {
    footerGap: r([8, 2, 20, 1]),
    buttonHeight: r([32, 24, 48, 1]),
    buttonPaddingX: r([10, 4, 24, 1]),
  },
} satisfies DialConfig;
