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
import { XIcon } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle01Icon,
  Cancel01Icon,
  ChevronDownIcon,
  CheckIcon,
} from "@hugeicons/core-free-icons";

const BROWSER_OPTIONS = [
  { id: "firefox", label: "Firefox", note: "Stores cookies in plaintext. Works on Windows." },
  { id: "edge", label: "Edge", note: "Uses DPAPI encryption. Fully readable." },
  { id: "chrome", label: "Chrome", note: "Chrome 127+ uses App-Bound Encryption. Manual mode recommended." },
  { id: "brave", label: "Brave", note: "Uses Chrome encryption. Manual mode recommended." },
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

  const openDropdown = () => {
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
  };

  const closeDropdown = () => {
    setDropdownOpen(false);
    setDdPos(null);
  };

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
        setConfig((prev) => ({
          ...prev,
          source: data.config?.source || null,
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
      loadConfig();
    } else {
      closeDropdown();
    }
  }, [open, loadConfig, closeDropdown]);

  const handleSave = async () => {
    if (!config.source) return;
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
        return;
      }
      setCookieMode(data.cookieMode);
      setShowSaved(true);
      onSaved?.();
      setTimeout(() => onOpenChange(false), 800);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
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
                onClick={() => setConfig((c) => ({ ...c, source: c.source === "auto" ? null : "auto" }))}
                onMouseEnter={(e) => { e.currentTarget.style.background = `light-dark(${sc.hoverBg}, ${sc.hoverBgDark})` }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: sc.gap,
                  padding: `${sc.paddingY}px ${sc.paddingX}px`,
                  borderRadius: sc.borderRadius,
                  background: "transparent",
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
                      {BROWSER_OPTIONS.find((b) => b.id === config.browser)?.note}
                    </p>
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
                onClick={() => setConfig((c) => ({ ...c, source: c.source === "manual" ? null : "manual" }))}
                onMouseEnter={(e) => { e.currentTarget.style.background = `light-dark(${sc.hoverBg}, ${sc.hoverBgDark})` }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: sc.gap,
                  padding: `${sc.paddingY}px ${sc.paddingX}px`,
                  borderRadius: sc.borderRadius,
                  background: "transparent",
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

            {/* Status */}
            <div style={{ minHeight: 28, display: "flex", alignItems: "center" }}>
              {statusBadge()}
            </div>
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
            render={
              <Button
                variant="ghost"
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
            disabled={saving}
            style={{
              padding: `${p.Footer.buttonPaddingY}px ${p.Footer.buttonPaddingX}px`,
              borderRadius: p.Footer.buttonBorderRadius,
            }}
          >
            {saving ? "Saving\u2026" : "Save Settings"}
          </Button>
        </DrawerFooter>
      </DrawerPopup>
    </Drawer>
  );
}
