"use client";

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/client-api";
import { useDialKit } from "dialkit";
import { syncSettingsDialConfig } from "@/components/ui/sync-settings-dial-config";
import {
  Drawer,
  DrawerClose,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ThinkingOrb } from "thinking-orbs";
import { XIcon } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle01Icon,
  Cancel01Icon,
  ChevronDownIcon,
  CheckIcon,
} from "@hugeicons/core-free-icons";

const BROWSER_OPTIONS = [
  { id: "firefox", label: "Firefox", auto: "yes", note: "Stores cookies in plaintext. Works on Windows." },
  { id: "edge", label: "Edge", auto: "no", note: "Edge 127+ uses App-Bound Encryption, and its cookie file is locked while Edge runs. Manual mode recommended." },
  { id: "chrome", label: "Chrome", auto: "no", note: "Chrome 127+ uses App-Bound Encryption. Manual mode recommended." },
  { id: "brave", label: "Brave", auto: "no", note: "Uses Chrome encryption. Manual mode recommended." },
] as const;

const COOKIE_MODE_LABELS: Record<string, string> = {
  "auto:firefox": "Auto-detect (Firefox)",
  "auto:edge": "Auto-detect (Edge)",
  "auto:chrome": "Auto-detect (Chrome)",
  "auto:brave": "Auto-detect (Brave)",
  "manual-runtime": "Manual (runtime)",
  "manual-firefox": "Manual (.env)",
  "manual-incomplete": "Incomplete. Both fields required.",
  missing: "Not configured",
};

interface ConfigState {
  source: "auto" | "manual" | null;
  browser: string;
  ct0: string;
  authToken: string;
}

interface SyncSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export default function SyncSettingsDialog({
  open,
  onOpenChange,
  onSaved,
}: SyncSettingsDialogProps) {
  const p = useDialKit("Sync Settings", syncSettingsDialConfig);

  const [config, setConfig] = useState<ConfigState>({
    source: null,
    browser: "firefox",
    ct0: "",
    authToken: "",
  });
  const [saving, setSaving] = useState(false);
  const [cookieMode, setCookieMode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [ddPos, setDdPos] = useState<{ top: number; left: number; width: number; spaceAbove: number; spaceBelow: number } | null>(null);
  const loadedSourceRef = useRef(false);
  const autoTriggerRef = useRef<HTMLButtonElement>(null);
  const ddMenuRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Saved-on-disk method (captured once per open) vs. the working draft.
  const [savedSource, setSavedSource] = useState<"auto" | "manual" | null>(null);
  const [savedBrowser, setSavedBrowser] = useState("firefox");
  // Mode the user asked to switch to but hasn't confirmed yet.
  const [pendingSource, setPendingSource] = useState<"auto" | "manual" | null>(null);
  // Live os_crypt wrapper class for the selected chromium browser.
  const [keyPrefix, setKeyPrefix] = useState<string | null>(null);

  const openDropdown = useCallback(() => {
    const trigger = autoTriggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setDdPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      spaceAbove: rect.top - 8,
      spaceBelow: window.innerHeight - rect.bottom - 8,
    });
    setDropdownOpen(true);
  }, []);

  const closeDropdown = useCallback(() => {
    setDropdownOpen(false);
    setDdPos(null);
  }, []);

  useLayoutEffect(() => {
    if (!dropdownOpen || !ddPos || !ddMenuRef.current) return;
    const menuHeight = ddMenuRef.current.offsetHeight;
    if (ddPos.spaceBelow < menuHeight && ddPos.spaceAbove >= menuHeight) {
      setDdPos((p) => (p ? { ...p, top: p.top - menuHeight - 8 } : p));
    }
  }, [dropdownOpen, ddPos]);

  const loadConfig = useCallback(async () => {
    try {
      const res = await apiFetch("/api/cookies");
      if (!res.ok) return;
      const data = await res.json();
      setCookieMode(data.cookieMode);
      if (!loadedSourceRef.current) {
        loadedSourceRef.current = true;
        const saved = data.config?.source || null;
        setSavedSource(saved);
        setSavedBrowser(data.config?.browser || "firefox");
        setPendingSource(null);
        setKeyPrefix(null);
        setConfig((prev) => ({
          ...prev,
          source: saved,
          browser: data.config?.browser || "firefox",
        }));
      }
    } catch (e) {
      console.warn("Failed to load cookie config", e);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setShowSaved(false);
      setError(null);
      loadedSourceRef.current = false;
      loadConfig();
    } else {
      closeDropdown();
    }
  }, [open, loadConfig, closeDropdown]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const handleSave = async () => {
    if (!config.source) return;
    if (
      config.source === "manual" &&
      (!config.ct0.trim() || !config.authToken.trim())
    ) {
      setError("Manual mode requires both ct0 and auth_token.");
      return;
    }
    setSaving(true);
    setError(null);
    setShowSaved(false);
    try {
      const body: Record<string, unknown> = {
        source: config.source,
      };
      if (config.source === "auto") {
        body.browser = config.browser;
      } else {
        body.ct0 = config.ct0;
        body.authToken = config.authToken;
      }
      const res = await apiFetch("/api/cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        setSaving(false);
        return;
      }
      setCookieMode(data.cookieMode);
      setShowSaved(true);
      onSaved?.();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        onOpenChange(false);
        setSaving(false);
      }, 800);
    } catch {
      setError("Network error");
      setSaving(false);
    }
  };

  const focusCt0 = () => {
    requestAnimationFrame(() => {
      document.getElementById("sync-ct0")?.focus();
    });
  };

  // Switching away from the saved-on-disk method discards its saved data on
  // the next save — confirm first. Unsaved drafts flip immediately, and
  // switching back to the saved method needs no confirm.
  const requestSourceSwitch = (target: "auto" | "manual") => {
    if (target === config.source) return;
    if (savedSource && savedSource !== target) {
      setPendingSource(target);
      return;
    }
    setPendingSource(null);
    setConfig((c) => ({ ...c, source: target }));
    if (target === "manual") focusCt0();
  };

  const confirmSourceSwitch = () => {
    if (!pendingSource) return;
    const target = pendingSource;
    setConfig((c) => ({ ...c, source: target }));
    setPendingSource(null);
    if (target === "manual") focusCt0();
  };

  const sc = p.ChoiceCard;
  const fc = p.FieldCard;
  const dd = p.Dropdown;
  const sb = p.StatusBadge;

  const statusBadge = () => {
    if (showSaved) {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: `${sb.paddingY}px ${sb.paddingX}px`,
            borderRadius: sb.borderRadius,
            fontSize: sb.fontSize,
            fontWeight: 500,
            background: sb.successBg as string,
            color: sb.successColor as string,
          }}
        >
          <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} />
          Settings saved
        </span>
      );
    }
    if (error) {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: `${sb.paddingY}px ${sb.paddingX}px`,
            borderRadius: sb.borderRadius,
            fontSize: sb.fontSize,
            fontWeight: 500,
            background: sb.errorBg as string,
            color: sb.errorColor as string,
          }}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} />
          {error}
        </span>
      );
    }
    if (cookieMode) {
      const isOk = cookieMode.includes("auto") || cookieMode === "manual-runtime";
      const isWarn = cookieMode === "manual-incomplete";
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: `${sb.paddingY}px ${sb.paddingX}px`,
            borderRadius: sb.borderRadius,
            fontSize: sb.fontSize,
            fontWeight: 500,
            background: isOk ? (sb.successBg as string) : isWarn ? (sb.warnBg as string) : (sb.idleBg as string),
            color: isOk ? (sb.successColor as string) : isWarn ? (sb.warnColor as string) : (sb.idleColor as string),
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: isOk ? (sb.successColor as string) : isWarn ? (sb.warnColor as string) : (sb.idleColor as string),
              flexShrink: 0,
            }}
          />
          {COOKIE_MODE_LABELS[cookieMode] || cookieMode}
        </span>
      );
    }
    return null;
  };

  const isAuto = config.source === "auto";
  const isManual = config.source === "manual";
  const canSave =
    Boolean(config.source) &&
    (!isManual || Boolean(config.ct0.trim() && config.authToken.trim()));
  const selectedBrowser = BROWSER_OPTIONS.find((b) => b.id === config.browser);

  // Resolve Auto capability live for chromium-family browsers (Edge is
  // version-dependent: DPAPI-era profiles work, APPB ones don't).
  useEffect(() => {
    if (!open || !isAuto || !selectedBrowser || selectedBrowser.auto === "yes") {
      setKeyPrefix(null);
      return;
    }
    let cancelled = false;
    setKeyPrefix(null);
    apiFetch(`/api/browser-key?browser=${selectedBrowser.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setKeyPrefix(data?.prefix ?? "missing");
      })
      .catch(() => {
        if (!cancelled) setKeyPrefix("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [open, isAuto, selectedBrowser]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} position="right">
      <DrawerPopup variant="inset" className="sync-settings-drawer border-s-0 sm:border-0 rounded-e-none sm:rounded-e-none" style={{ borderStartStartRadius: p.Popup.radius, borderEndStartRadius: p.Popup.radius }}>
        <DrawerHeader
          style={{
            paddingTop: p.Title.paddingTop,
            paddingBottom: p.Title.paddingBottom,
            paddingLeft: p.Title.paddingLeft,
            paddingRight: p.Title.paddingRight,
            gap: p.Title.gap,
            position: "relative",
          }}
        >
          <DrawerTitle style={{ fontSize: p.Title.titleSize }}>Sync Settings</DrawerTitle>
          <DrawerDescription style={{ fontSize: p.Title.descSize }}>
            Configure how Kairos connects to X/Twitter to sync your bookmarks.
          </DrawerDescription>
          <DrawerClose
            render={
              <Button
                size="icon"
                variant="ghost"
                aria-label="Close"
                style={{
                  color: p.CloseButton.iconColor as string,
                  background: p.CloseButton.bg as string,
                }}
                className="absolute end-2 top-2"
                onMouseEnter={(e) => { e.currentTarget.style.background = p.CloseButton.hoverBg as string }}
                onMouseLeave={(e) => { e.currentTarget.style.background = p.CloseButton.bg as string }}
              />
            }
          >
            <XIcon />
          </DrawerClose>
        </DrawerHeader>

        <DrawerPanel>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: p.Section.gap,
              padding: `${p.Section.panelPaddingY}px ${p.Section.panelPaddingX}px`,
            }}
          >
            {/* Choice: Auto-detect */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: p.Section.innerGap,
              }}
            >
              <button
                type="button"
                role="radio"
                aria-checked={isAuto}
                onClick={() => requestSourceSwitch("auto")}
                onMouseEnter={(e) => { e.currentTarget.style.background = `light-dark(${sc.hoverBg}, ${sc.hoverBgDark})` }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: sc.gap,
                  padding: `${sc.paddingY}px ${sc.paddingX}px`,
                  borderRadius: sc.borderRadius,
                  background: isAuto ? `light-dark(${sc.hoverBg}, ${sc.hoverBgDark})` : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "background-color 0.15s ease",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: sc.titleSize, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.3 }}>
                    Auto-detect from browser
                  </div>
                  <div style={{ fontSize: sc.subtitleSize, color: "var(--muted-foreground)", marginTop: sc.subtitleGap, lineHeight: 1.4 }}>
                    Automatically reads cookies from your installed browser
                  </div>
                </div>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    flexShrink: 0,
                    transform: `rotate(${isAuto ? 180 : 0}deg)`,
                    transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    color: isAuto ? "var(--foreground)" : "var(--muted-foreground)",
                  }}
                >
                  <HugeiconsIcon icon={ChevronDownIcon} size={sc.chevronSize} />
                </span>
                {isAuto && (
                  <span style={{ fontSize: sc.subtitleSize, fontWeight: 600, color: "var(--foreground)", flexShrink: 0 }}>
                    Selected
                  </span>
                )}
              </button>

              <div
                style={{
                  display: "grid",
                  gridTemplateRows: isAuto ? "1fr" : "0fr",
                  opacity: isAuto ? 1 : 0,
                  transition: "grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                <div style={{ minHeight: 0, overflow: "hidden" }}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: fc.gap,
                      padding: `${fc.paddingY}px ${fc.paddingX}px`,
                      borderRadius: fc.borderRadius,
                      background: `light-dark(${fc.bg}, ${fc.bgDark})`,
                    }}
                  >
                    {/* Auto content */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: fc.inputGap,
                      }}
                    >
                      <div style={{ fontSize: fc.labelSize, fontWeight: fc.labelWeight, color: fc.labelColor as string }}>
                        Browser
                      </div>
                      <div style={{ position: "relative" }}>
                        <button
                          ref={autoTriggerRef}
                          type="button"
                          onClick={() => (dropdownOpen ? closeDropdown() : openDropdown())}
                          onFocus={(e) => { e.currentTarget.style.background = dd.focusBg as string }}
                          onBlur={(e) => { e.currentTarget.style.background = dd.bg as string }}
                          style={{
                            height: dd.height,
                            borderRadius: dd.borderRadius,
                            paddingLeft: dd.paddingX,
                            paddingRight: dd.paddingX,
                            fontSize: dd.fontSize,
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            cursor: "pointer",
                            color: "var(--foreground)",
                            background: dd.bg as string,
                            border: "none",
                            outline: "none",
                            transition: "background-color 0.15s ease",
                          }}
                        >
                          <span>{BROWSER_OPTIONS.find((b) => b.id === config.browser)?.label}</span>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              transform: `rotate(${dropdownOpen ? 180 : 0}deg)`,
                              transition: "transform 0.2s ease",
                              opacity: 0.5,
                            }}
                          >
                            <HugeiconsIcon icon={ChevronDownIcon} size={dd.checkSize} />
                          </span>
                        </button>
                        {dropdownOpen &&
                          ddPos &&
                          createPortal(
                            <>
                              <button type="button" aria-label="Close dropdown" className="fixed inset-0 z-40 cursor-default" onClick={closeDropdown} onKeyDown={(e) => { if (e.key === 'Escape') closeDropdown() }} />
                              <div
                                ref={ddMenuRef}
                                className="overlay-pop"
                                style={{
                                  position: "fixed",
                                  left: ddPos.left,
                                  width: ddPos.width,
                                  top: ddPos.top,
                                  zIndex: 1000,
                                  borderRadius: dd.menuRadius,
                                  background: dd.menuBg as string,
                                  padding: dd.menuPadding,
                                }}
                              >
                                {BROWSER_OPTIONS.map((b) => {
                                  const selected = config.browser === b.id;
                                  return (
                                    <button
                                      key={b.id}
                                      type="button"
                                      onClick={() => {
                                        setConfig((prev) => ({ ...prev, browser: b.id }));
                                        closeDropdown();
                                      }}
                                      style={{
                                        display: "flex",
                                        width: "100%",
                                        alignItems: "center",
                                        gap: dd.itemGap,
                                        padding: `${dd.itemPaddingY}px ${dd.itemPaddingX}px`,
                                        borderRadius: dd.itemRadius,
                                        fontSize: dd.itemFontSize,
                                        cursor: "pointer",
                                        color: "var(--foreground)",
                                        background: selected ? (dd.itemHoverBg as string) : "transparent",
                                        border: "none",
                                        textAlign: "left",
                                        transition: "background 0.1s ease",
                                      }}
                                      onMouseEnter={(e) => { e.currentTarget.style.background = dd.itemHoverBg as string }}
                                      onMouseLeave={(e) => { e.currentTarget.style.background = selected ? (dd.itemHoverBg as string) : "transparent" }}
                                    >
                                    <span style={{ width: dd.checkSize, display: "flex", alignItems: "center", flexShrink: 0 }}>
                                      {selected && (
                                        <HugeiconsIcon icon={CheckIcon} size={dd.checkSize} strokeWidth={2.5} />
                                      )}
                                    </span>
                                    <span>{b.label}</span>
                                    <span style={{ marginLeft: "auto", paddingLeft: 8, fontSize: dd.itemFontSize, color: "var(--muted-foreground)", flexShrink: 0 }}>
                                      {b.auto === "yes" ? "Auto ✓" : b.auto === "no" ? "Manual required" : "Auto if DPAPI-era"}
                                    </span>
                                  </button>
                                );
                              })}
                              </div>
                            </>,
                            document.body
                          )}
                      </div>
                    </div>
                    <p style={{ fontSize: fc.noteSize, color: "var(--muted-foreground)", lineHeight: 1.4, margin: 0 }}>
                      {selectedBrowser?.note}
                      {selectedBrowser && selectedBrowser.auto !== "yes" && keyPrefix && (
                        <>
                          {" "}Detected on this machine:{" "}
                          {keyPrefix === "dpapi"
                            ? "DPAPI — Auto will work."
                            : keyPrefix === "app-bound"
                              ? "App-Bound — use Manual mode."
                              : "no readable profile."}
                        </>
                      )}
                    </p>
                    {selectedBrowser?.auto === "no" && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                          padding: `${sb.paddingY}px ${sb.paddingX}px`,
                          borderRadius: sb.borderRadius,
                          fontSize: sb.fontSize,
                          background: sb.warnBg as string,
                          color: sb.warnColor as string,
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 140, lineHeight: 1.4 }}>
                          {selectedBrowser.id === "edge"
                            ? "Edge locks its cookie file while running, and 127+ uses App-Bound Encryption — Auto rarely works."
                            : `${selectedBrowser.label} 127+ uses App-Bound Encryption — Auto cannot read it.`}
                        </span>
                        <button
                          type="button"
                          onClick={() => requestSourceSwitch("manual")}
                          style={{
                            padding: "4px 10px",
                            borderRadius: sb.borderRadius,
                            fontSize: sb.fontSize,
                            fontWeight: 600,
                            cursor: "pointer",
                            color: sb.warnColor as string,
                            background: "transparent",
                            border: `1px solid ${sb.warnColor as string}`,
                          }}
                        >
                          Use Manual instead
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Choice: Manual */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: p.Section.innerGap,
              }}
            >
              <button
                type="button"
                role="radio"
                aria-checked={isManual}
                onClick={() => requestSourceSwitch("manual")}
                onMouseEnter={(e) => { e.currentTarget.style.background = `light-dark(${sc.hoverBg}, ${sc.hoverBgDark})` }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: sc.gap,
                  padding: `${sc.paddingY}px ${sc.paddingX}px`,
                  borderRadius: sc.borderRadius,
                  background: isManual ? `light-dark(${sc.hoverBg}, ${sc.hoverBgDark})` : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "background-color 0.15s ease",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: sc.titleSize, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.3 }}>
                    Manually enter cookies
                  </div>
                  <div style={{ fontSize: sc.subtitleSize, color: "var(--muted-foreground)", marginTop: sc.subtitleGap, lineHeight: 1.4 }}>
                    Paste ct0 and auth_token from DevTools
                  </div>
                </div>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    flexShrink: 0,
                    transform: `rotate(${isManual ? 180 : 0}deg)`,
                    transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    color: isManual ? "var(--foreground)" : "var(--muted-foreground)",
                  }}
                >
                  <HugeiconsIcon icon={ChevronDownIcon} size={sc.chevronSize} />
                </span>
                {isManual && (
                  <span style={{ fontSize: sc.subtitleSize, fontWeight: 600, color: "var(--foreground)", flexShrink: 0 }}>
                    Selected
                  </span>
                )}
              </button>

              <div
                style={{
                  display: "grid",
                  gridTemplateRows: isManual ? "1fr" : "0fr",
                  opacity: isManual ? 1 : 0,
                  transition: "grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                <div style={{ minHeight: 0, overflow: "hidden" }}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: fc.gap,
                      padding: `${fc.paddingY}px ${fc.paddingX}px`,
                      borderRadius: fc.borderRadius,
                      background: `light-dark(${fc.bg}, ${fc.bgDark})`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: fc.inputGap,
                      }}
                    >
                      <Field>
                        <FieldLabel style={{ fontSize: fc.labelSize, fontWeight: fc.labelWeight, color: fc.labelColor as string }}>
                          ct0
                        </FieldLabel>
                        <Input
                          id="sync-ct0"
                          type="password"
                          placeholder="Paste ct0 cookie value"
                          value={config.ct0}
                          onChange={(e) => setConfig((c) => ({ ...c, ct0: e.target.value }))}
                          style={{
                            padding: `${fc.inputPaddingY}px ${fc.inputPaddingX}px`,
                            borderRadius: fc.inputBorderRadius,
                            fontSize: fc.inputFontSize,
                            background: fc.inputBg as string,
                            ["--sync-input-focus-bg" as string]: fc.inputFocusBg as string,
                            ["--sync-placeholder" as string]: fc.inputPlaceholder as string,
                          }}
                        />
                      </Field>
                      <Field>
                        <FieldLabel style={{ fontSize: fc.labelSize, fontWeight: fc.labelWeight, color: fc.labelColor as string }}>
                          auth_token
                        </FieldLabel>
                        <Input
                          type="password"
                          placeholder="Paste auth_token cookie value"
                          value={config.authToken}
                          onChange={(e) => setConfig((c) => ({ ...c, authToken: e.target.value }))}
                          style={{
                            padding: `${fc.inputPaddingY}px ${fc.inputPaddingX}px`,
                            borderRadius: fc.inputBorderRadius,
                            fontSize: fc.inputFontSize,
                            background: fc.inputBg as string,
                            ["--sync-input-focus-bg" as string]: fc.inputFocusBg as string,
                            ["--sync-placeholder" as string]: fc.inputPlaceholder as string,
                          }}
                        />
                      </Field>
                    </div>
                    <p style={{ fontSize: fc.noteSize, color: "var(--muted-foreground)", lineHeight: 1.4, margin: 0 }}>
                      X.com → DevTools → Application → Cookies →{" "}
                      <code
                        style={{
                          borderRadius: fc.codeRadius,
                          background: fc.codeBg as string,
                          padding: "1px 6px",
                          fontSize: fc.noteSize,
                        }}
                      >
                        ct0
                      </code>
                      {" & "}
                      <code
                        style={{
                          borderRadius: fc.codeRadius,
                          background: fc.codeBg as string,
                          padding: "1px 6px",
                          fontSize: fc.noteSize,
                        }}
                      >
                        auth_token
                      </code>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {pendingSource && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: `${fc.paddingY}px ${fc.paddingX}px`,
                  borderRadius: fc.borderRadius,
                  background: `light-dark(${fc.bg}, ${fc.bgDark})`,
                }}
              >
                <p style={{ fontSize: sc.subtitleSize, color: "var(--foreground)", lineHeight: 1.4, margin: 0 }}>
                  Switching to {pendingSource === "auto" ? "Auto-detect" : "Manual entry"} will discard the saved{" "}
                  {savedSource === "auto" ? `auto pairing (${savedBrowser})` : "manual tokens"} when you save.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    onClick={confirmSourceSwitch}
                    style={{
                      padding: "6px 12px",
                      borderRadius: fc.inputBorderRadius,
                      fontSize: sc.subtitleSize,
                    }}
                  >
                    Switch anyway
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setPendingSource(null)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: fc.inputBorderRadius,
                      fontSize: sc.subtitleSize,
                    }}
                  >
                    Keep editing
                  </Button>
                </div>
              </div>
            )}

            {/* Status */}
            <div style={{ minHeight: 28, display: "flex", alignItems: "center" }}>
              {statusBadge()}
            </div>
            <p style={{ fontSize: fc.noteSize, color: "var(--muted-foreground)", lineHeight: 1.4, margin: 0 }}>
              Save Settings applies the selected connection method. Saving persists only the active method and discards the other method’s saved data after confirmation.
            </p>
          </div>
        </DrawerPanel>

        <DrawerFooter
          className="border-t-0"
          style={{
            paddingTop: p.Footer.paddingTop,
            paddingBottom: p.Footer.paddingBottom,
            paddingLeft: p.Footer.paddingLeft,
            paddingRight: p.Footer.paddingRight,
            gap: p.Footer.gap,
            background: p.Footer.bg as string,
          }}
        >
          <DrawerClose
            disabled={saving}
            render={
              <Button
                variant="ghost"
                disabled={saving}
                style={{
                  padding: `${p.Footer.buttonPaddingY}px ${p.Footer.buttonPaddingX}px`,
                  borderRadius: p.Footer.buttonBorderRadius,
                }}
              />
            }
          >
            Cancel
          </DrawerClose>
          <Button
            onClick={handleSave}
            disabled={saving || !canSave}
            aria-busy={saving}
            style={{
              padding: `${p.Footer.buttonPaddingY}px ${p.Footer.buttonPaddingX}px`,
              borderRadius: p.Footer.buttonBorderRadius,
            }}
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <ThinkingOrb state="working" size={20} aria-label="Saving" />
                <span>Saving…</span>
              </span>
            ) : (
              "Save Settings"
            )}
          </Button>
        </DrawerFooter>
      </DrawerPopup>
    </Drawer>
  );
}
