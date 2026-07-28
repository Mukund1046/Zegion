"use client";

import { useDialKit } from "dialkit";
import {
  frame,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import React, {
  type ComponentPropsWithoutRef,
  useEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";
import { SquircleClip } from "@/components/ui/squircle-clip";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/reui/badge";
import { Kbd } from "@/components/ui/kbd";
import { SearchIcon } from "lucide-react";

const INPUT_TYPE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "password", label: "Password" },
];

const inputWrapperClassName =
  "bg-muted2 relative w-full max-w-[420px] rounded-2xl p-4";

const inputClassName =
  "w-full bg-transparent outline-none placeholder:text-foreground/40";

type InputFieldProps = ComponentPropsWithoutRef<"input"> & {
  wrapperClassName?: string;
};

type SmoothInputType = "text" | "password";

type SmoothInputProps = Omit<InputFieldProps, "type"> & {
  type?: SmoothInputType;
};

const Input = ({ className, wrapperClassName, ...props }: InputFieldProps) => {
  return (
    <div className={cn(inputWrapperClassName, wrapperClassName)}>
      <input className={cn(inputClassName, className)} {...props} />
    </div>
  );
};

const PASSWORD_CHAR = navigator.userAgent.match(/firefox|fxios/i)
  ? "\u25CF"
  : "\u2022";

const SmoothInput = ({
  className,
  wrapperClassName,
  value,
  defaultValue,
  onChange,
  onBlur,
  type = "text",
  placeholder,
  style,
  ...props
}: SmoothInputProps) => {
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const caretX = useMotionValue(0);
  const caretOpacity = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const isControlled = value !== undefined;

  const params = useDialKit(
    "Smooth Input",
    {
      inputType: {
        type: "select",
        options: INPUT_TYPE_OPTIONS,
        default: type,
      },
      placeholder: {
        type: "text",
        default: placeholder ?? "smooth input",
        placeholder: "Empty state text…",
      },
      fontSize: [24, 12, 48, 2],
      spring: {
        type: "spring",
        stiffness: 500,
        damping: 30,
        mass: 0.5,
      },
      clear: { type: "action", label: "Clear value" },
    },
    {
      onAction: (path) => {
        if (path !== "clear") return;

        if (!isControlled) {
          setInternalValue("");
        }

        onChange?.({
          target: { value: "" },
          currentTarget: { value: "" },
        } as React.ChangeEvent<HTMLInputElement>);
        caretOpacity.set(0);
      },
    },
  );

  const springCaretX = useSpring(
    caretX,
    prefersReducedMotion
      ? { stiffness: 10000, damping: 100, mass: 0.1 }
      : params.spring,
  );

  const inputValue = isControlled ? String(value) : internalValue;
  const activeType = params.inputType as SmoothInputType;
  const displayPlaceholder = params.placeholder || placeholder || "smooth input";

  const syncMeasureSpan = () => {
    const input = inputRef.current;
    const measureSpan = measureRef.current;
    if (!input || !measureSpan) return;

    const styles = window.getComputedStyle(input);
    const isPassword = input.type === "password";

    let fontSize = styles.fontSize;
    if (
      PASSWORD_CHAR === "\u2022" &&
      isPassword &&
      !navigator.userAgent.match(/chrome|chromium|crios/i)
    ) {
      fontSize = `${parseFloat(fontSize) + 6.25}px`;
    }

    measureSpan.style.font = `${styles.fontStyle} ${styles.fontWeight} ${fontSize} ${styles.fontFamily}`;
    measureSpan.style.letterSpacing = styles.letterSpacing;
    measureSpan.style.fontFeatureSettings = styles.fontFeatureSettings;
    measureSpan.style.fontVariationSettings = styles.fontVariationSettings;
  };

  const measurePrefixWidth = (text: string) => {
    const input = inputRef.current;
    const measureSpan = measureRef.current;
    if (!input || !measureSpan) return null;

    syncMeasureSpan();
    measureSpan.textContent = text;

    const paddingLeft =
      parseFloat(window.getComputedStyle(input).paddingLeft) || 0;

    return text.length > 0
      ? measureSpan.offsetWidth + paddingLeft
      : paddingLeft - 1;
  };

  const computeScrollLeft = (
    target: HTMLInputElement,
    absoluteWidth: number,
  ): { scrollLeft: number; changed: boolean } => {
    const styles = window.getComputedStyle(target);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    const maxScroll = Math.max(0, target.scrollWidth - target.clientWidth);
    const visibleRight = target.scrollLeft + target.clientWidth - paddingRight;
    const visibleLeft = target.scrollLeft + paddingLeft;

    if (absoluteWidth > visibleRight) {
      return {
        scrollLeft: Math.min(
          absoluteWidth - target.clientWidth + paddingRight,
          maxScroll,
        ),
        changed: true,
      };
    }

    if (absoluteWidth < visibleLeft) {
      return {
        scrollLeft: Math.max(0, absoluteWidth - paddingLeft),
        changed: true,
      };
    }

    return { scrollLeft: target.scrollLeft, changed: false };
  };

  const getCaretIndex = (target: HTMLInputElement) => {
    const selectionStart = target.selectionStart ?? 0;
    const selectionEnd = target.selectionEnd ?? 0;

    if (selectionStart === selectionEnd) {
      return selectionStart;
    }

    return target.selectionDirection === "backward"
      ? selectionStart
      : selectionEnd;
  };

  const updateCaretFromInput = (target: HTMLInputElement) => {
    frame.read(() => {
      const selectionStart = target.selectionStart ?? 0;
      const selectionEnd = target.selectionEnd ?? 0;
      const hasSelection = selectionStart !== selectionEnd;
      const caretIndex = getCaretIndex(target);
      const isPassword = target.type === "password";
      const textBeforeCaret = isPassword
        ? PASSWORD_CHAR.repeat(caretIndex)
        : target.value.slice(0, caretIndex);

      const absoluteWidth = measurePrefixWidth(textBeforeCaret);
      if (absoluteWidth === null) return;

      const { scrollLeft, changed } = computeScrollLeft(
        target,
        absoluteWidth,
      );

      const styles = window.getComputedStyle(target);
      const paddingLeft = parseFloat(styles.paddingLeft) || 0;
      const paddingRight = parseFloat(styles.paddingRight) || 0;
      const caretPosition = absoluteWidth - scrollLeft;
      const minX = paddingLeft - 1;
      const maxX = target.clientWidth - paddingRight;
      const isCaretVisible =
        caretPosition >= minX && caretPosition <= maxX + 1;

      frame.render(() => {
        if (changed) target.scrollLeft = scrollLeft;
        caretX.set(Math.min(caretPosition, maxX));

        if (!isCaretVisible || hasSelection) {
          caretOpacity.set(0);
          return;
        }

        caretOpacity.set(1);
      });
    });
  };

  const updateCaretRef = useRef(updateCaretFromInput);
  updateCaretRef.current = updateCaretFromInput;
  const caretOpacityRef = useRef(caretOpacity);
  caretOpacityRef.current = caretOpacity;

  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement === input) {
      updateCaretRef.current(input);
    }
  }, [inputValue]);

  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement === input) {
      updateCaretRef.current(input);
    }
  }, [activeType, params.fontSize]);

  useEffect(() => {
    const input = inputRef.current;
    const container = containerRef.current;
    if (!input || !container) return;

    const updateCaretIfFocused = () => {
      if (document.activeElement === input) {
        updateCaretRef.current(input);
      }
    };

    const handleSelectionChange = () => {
      if (document.activeElement !== input) return;

      frame.render(() => {
        if (document.activeElement === input) {
          updateCaretRef.current(input);
        }
      });
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    document.fonts.addEventListener("loadingdone", updateCaretIfFocused);
    void document.fonts.ready.then(updateCaretIfFocused);
    input.addEventListener("scroll", updateCaretIfFocused);

    const resizeObserver = new ResizeObserver(updateCaretIfFocused);
    resizeObserver.observe(container);

    updateCaretIfFocused();

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.fonts.removeEventListener("loadingdone", updateCaretIfFocused);
      input.removeEventListener("scroll", updateCaretIfFocused);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className={cn(inputWrapperClassName, wrapperClassName)}>
      <div
        ref={containerRef}
        className="relative grid grid-cols-1 p-0"
        style={{ caretColor: "transparent", fontSize: params.fontSize }}
      >
        <input
          {...props}
          ref={inputRef}
          type={activeType}
          placeholder={displayPlaceholder}
          className={cn(
            inputClassName,
            "col-start-1 col-end-2 row-start-1 row-end-2 text-inherit",
            className,
          )}
          style={style}
          value={inputValue}
          onChange={(e) => {
            if (!isControlled) setInternalValue(e.target.value);
            onChange?.(e);
            frame.render(() => {
              updateCaretRef.current(e.target);
            });
          }}
          onBlur={(e) => {
            caretOpacityRef.current.set(0);
            onBlur?.(e);
          }}
        />
        <span
          ref={measureRef}
          aria-hidden
          className="pointer-events-none invisible absolute top-0 left-0 whitespace-pre"
        />
        <motion.div
          className="bg-primary pointer-events-none col-start-1 col-end-2 row-start-1 row-end-2 h-[0.9em] w-px self-center"
          style={{ x: springCaretX, opacity: caretOpacity, willChange: "transform" }}
        />
      </div>
    </div>
  );
};

const SearchButtonPreview = () => {
  const params = useDialKit("Search Button", {
    strokeColor: { type: "color", default: "#dde0e5" },
    bgColor: { type: "color", default: "#ffffff" },
    borderRadius: [12, 0, 32, 1],
    gap: [8, 0, 32, 1],
    minHeight: [34, 24, 80, 1],
    minWidth: [200, 80, 600, 10],
    paddingTop: [0, 0, 32, 1],
    paddingBottom: [0, 0, 32, 1],
    paddingLeft: [12, 0, 48, 1],
    paddingRight: [12, 0, 48, 1],
    opacity: [1, 0, 1, 0.05],
    fontSize: [13, 10, 24, 1],
    statsFontSize: [10, 8, 20, 1],
    statsBorderRadius: [7, 0, 16, 1],
    statsPaddingX: [8, 0, 24, 1],
    statsPaddingY: [2, 0, 12, 1],
    borderWidth: [1, 0, 4, 0.5],
  });

  const [value, setValue] = useState("");
  const pt = params.paddingTop as number;
  const pb = params.paddingBottom as number;
  const pl = params.paddingLeft as number;
  const pr = params.paddingRight as number;
  const br = params.borderRadius as number;
  const bw = params.borderWidth as number;

  return (
    <SquircleClip asChild cornerRadius={br} cornerSmoothing={1} stroke={params.strokeColor} strokeWidth={bw}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: params.gap,
          minHeight: params.minHeight,
          minWidth: params.minWidth,
          paddingTop: pt,
          paddingBottom: pb,
          paddingLeft: pl,
          paddingRight: pr,
          background: params.bgColor,
          color: "var(--muted-foreground)",
          opacity: params.opacity,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <SmoothInput
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search…"
          wrapperClassName="!bg-transparent !max-w-none !rounded-none !p-0 !border-0 !outline-none"
          style={{ fontSize: params.fontSize }}
        />
        <div
          style={{
            fontSize: params.statsFontSize,
            whiteSpace: "nowrap",
            paddingTop: params.statsPaddingY,
            paddingBottom: params.statsPaddingY,
            paddingLeft: params.statsPaddingX,
            paddingRight: params.statsPaddingX,
            background: "rgba(0,0,0,0.04)",
            borderRadius: params.statsBorderRadius,
            color: "var(--muted-foreground)",
          }}
        >
          {Math.max(0, 42 - value.length)} found
        </div>
      </div>
    </SquircleClip>
  );
};

const SearchCommandPreview = () => {
  const params = useDialKit("Search Command", {
    width: [560, 320, 800, 20],
    maxHeight: [400, 200, 800, 20],
    borderRadius: [12, 0, 32, 1],
    inputFontSize: [14, 10, 24, 1],
    inputPaddingX: [12, 4, 32, 1],
    inputPaddingY: [10, 4, 24, 1],
    itemGap: [6, 0, 24, 1],
    itemPaddingX: [10, 4, 32, 1],
    itemPaddingY: [8, 2, 20, 1],
    maxResults: [8, 3, 30, 1],
    strokeColor: { type: "color", default: "var(--border)" },
    bgColor: { type: "color", default: "var(--popover)" },
    hoverBg: { type: "color", default: "var(--muted)" },
  });

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const w = params.width as number;
  const mh = params.maxHeight as number;

  const items = [
    { id: "1", author: "Alice Chen", handle: "@alice", text: "Exploring the intersection of AI and creativity in modern art", folder: "Tech" },
    { id: "2", author: "Bob Martinez", handle: "@bob", text: "A deep dive into Rust's ownership model and memory safety", folder: "Dev" },
    { id: "3", author: "Carol Smith", handle: "@carol", text: "New research on quantum computing breakthroughs in 2026", folder: "Science" },
    { id: "4", author: "David Kim", handle: "@david", text: "Building accessible web applications with modern CSS", folder: "Design" },
    { id: "5", author: "Eve Johnson", handle: "@eve", text: "The rise of edge computing and its impact on cloud architecture", folder: "Tech" },
    { id: "6", author: "Frank Lee", handle: "@frank", text: "Understanding distributed systems through real-world examples", folder: "Dev" },
    { id: "7", author: "Grace Wang", handle: "@grace", text: "Photography tips for capturing urban landscapes at night", folder: "Art" },
  ];

  const results = items.filter(
    (item) =>
      !query.trim() ||
      item.author.toLowerCase().includes(query.toLowerCase()) ||
      item.text.toLowerCase().includes(query.toLowerCase()),
  ).slice(0, params.maxResults as number);

  return (
    <div className="flex flex-col items-center gap-3">
      <SquircleClip asChild cornerRadius={9} cornerSmoothing={1}>
        <Button
          variant="outline"
          className="w-52 justify-between gap-2 text-sm font-normal text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          <span className="flex items-center gap-2">
            <SearchIcon className="size-4 shrink-0 opacity-50" />
            <span>Search command preview…</span>
          </span>
          <Kbd>⌘K</Kbd>
        </Button>
      </SquircleClip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="flex flex-col gap-0 overflow-hidden p-0!"
          style={{
            width: w,
            maxHeight: mh,
            borderRadius: params.borderRadius,
            background: params.bgColor,
          }}
          showCloseButton={false}
        >
          <div
            className="flex items-center gap-2 border-b border-border"
            style={{
              paddingLeft: params.inputPaddingX,
              paddingRight: params.inputPaddingX,
              paddingTop: params.inputPaddingY,
              paddingBottom: params.inputPaddingY,
            }}
          >
            <SearchIcon className="size-4 shrink-0 text-muted-foreground/50" />
            <SmoothInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              wrapperClassName="!bg-transparent !max-w-none !rounded-none !p-0 !border-0 !outline-none"
              style={{ fontSize: params.inputFontSize }}
            />
          </div>
          <div className="no-scrollbar flex-1 overflow-y-auto p-1">
            {results.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No results found.
              </div>
            )}
            {results.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex w-full items-start gap-3 rounded-lg text-left transition-colors hover:bg-muted"
                style={{
                  paddingLeft: params.itemPaddingX,
                  paddingRight: params.itemPaddingX,
                  paddingTop: params.itemPaddingY,
                  paddingBottom: params.itemPaddingY,
                  gap: params.itemGap,
                }}
                onClick={() => setOpen(false)}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {item.author}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {item.handle}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {item.text}
                  </p>
                </div>
                <Badge variant="outline" size="sm">
                  {item.folder}
                </Badge>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Skiper106 = () => {
  return (
    <div className="bg-muted text-foreground flex h-full w-full flex-col items-center justify-center">
      <div className="-mt-10 mb-20 grid content-start justify-items-center gap-6 text-center">
        <span className="after:bg-linear-to-b after:to-foreground relative max-w-[12ch] text-xs uppercase leading-tight opacity-40 after:absolute after:left-1/2 after:top-full after:h-16 after:w-px after:from-transparent after:content-['']">
          Try typing below
        </span>
      </div>
      <div className="flex w-full flex-col items-center space-y-4">
        <SearchCommandPreview />
        <SearchButtonPreview />
        <Input
          placeholder="normal input"
          className="caret-primary text-2xl"
          wrapperClassName="max-w-[420px] p-4"
          aria-label="Normal input"
        />
      </div>
    </div>
  );
};

export { Input, Skiper106, SmoothInput };
