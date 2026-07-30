"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
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
  BrowserIcon,
  ChevronDownIcon,
  CheckIcon,
  LockIcon,
} from "@hugeicons/core-free-icons";

const BROWSER_OPTIONS = [
  { id: "firefox", label: "Firefox", note: "Stores cookies in plaintext — works on Windows" },
  { id: "edge", label: "Edge", note: "Uses DPAPI encryption — readable by FT" },
  { id: "chrome", label: "Chrome", note: "Chrome 127+ uses App-Bound Encryption — manual mode recommended" },
  { id: "brave", label: "Brave", note: "Uses Chrome encryption — manual mode recommended" },
] as const;

const COOKIE_MODE_LABELS: Record<string, string> = {
  "auto:firefox": "Auto-detect (Firefox)",
  "auto:edge": "Auto-detect (Edge)",
  "auto:chrome": "Auto-detect (Chrome)",
  "auto:brave": "Auto-detect (Brave)",
  "manual-runtime": "Manual (runtime)",
  "manual-firefox": "Manual (.env)",
  "manual-incomplete": "Incomplete — both fields required",
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

  const loadConfig = useCallback(async () => {
    try {
      const res = await apiFetch("/api/cookies");
      if (!res.ok) return;
      const data = await res.json();
      setConfig((prev) => ({
        ...prev,
        source: data.config?.source || null,
        browser: data.config?.browser || "firefox",
      }));
      setCookieMode(data.cookieMode);
    } catch (e) {
      console.warn("Failed to load cookie config", e);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setShowSaved(false);
      setError(null);
      loadConfig();
    }
  }, [open, loadConfig]);

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
      <DrawerPopup variant="inset" className="border-s-0 sm:border-0 rounded-e-none sm:rounded-e-none" style={{ borderStartStartRadius: 24, borderEndStartRadius: 24 }}>
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
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: sc.gap,
                  padding: `${sc.paddingY}px ${sc.paddingX}px`,
                  borderRadius: sc.borderRadius,
                  border: `1.5px solid ${isAuto ? sc.activeBorder : sc.idleBorder}`,
                  background: isAuto ? (sc.activeBg as string) : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "border-color 0.15s ease, background 0.15s ease",
                }}
              >
                <div
                  style={{
                    width: sc.iconSize,
                    height: sc.iconSize,
                    borderRadius: sc.iconRadius,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: isAuto ? (sc.iconActiveBg as string) : (sc.iconBg as string),
                    color: isAuto ? (sc.iconActiveColor as string) : (sc.iconColor as string),
                    flexShrink: 0,
                  }}
                >
                  <HugeiconsIcon icon={BrowserIcon} size={sc.iconInner} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: sc.titleSize, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.3 }}>
                    Auto-detect from browser
                  </div>
                  <div style={{ fontSize: sc.subtitleSize, color: "var(--muted-foreground)", marginTop: 2, lineHeight: 1.4 }}>
                    Field Theory extracts cookies directly from your browser
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
                    marginTop: 2,
                  }}
                >
                  <HugeiconsIcon icon={ChevronDownIcon} size={18} />
                </span>
              </button>

              <AnimatePresence initial={false}>
                {isAuto && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    style={{ overflow: "hidden" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: fc.gap,
                        padding: `${fc.paddingY}px ${fc.paddingX}px`,
                        borderRadius: fc.borderRadius,
                        border: `1px solid ${fc.borderColor}`,
                        background: fc.bg as string,
                        marginLeft: p.Section.sectionPaddingX,
                      }}
                    >
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
                            type="button"
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                            style={{
                              height: dd.height,
                              borderRadius: dd.borderRadius,
                              paddingLeft: dd.paddingX,
                              paddingRight: dd.paddingX,
                              fontSize: dd.fontSize,
                              width: (dd.width as number) > 0 ? dd.width : "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                              cursor: "pointer",
                              color: "var(--foreground)",
                              background: dd.bg as string,
                              border: `1px solid ${dd.borderColor}`,
                              transition: "border-color 0.15s ease",
                            }}
                            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                          {dropdownOpen && (
                            <>
                              <button type="button" aria-label="Close dropdown" className="fixed inset-0 z-40 cursor-default" onClick={() => setDropdownOpen(false)} onKeyDown={(e) => { if (e.key === 'Escape') setDropdownOpen(false) }} />
                              <div
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  right: 0,
                                  top: "100%",
                                  marginTop: 4,
                                  zIndex: 50,
                                  borderRadius: dd.borderRadius,
                                  border: `1px solid ${dd.menuBorder}`,
                                  background: dd.menuBg as string,
                                  padding: 4,
                                  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
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
                                        setDropdownOpen(false);
                                      }}
                                      style={{
                                        display: "flex",
                                        width: "100%",
                                        alignItems: "center",
                                        gap: dd.itemGap,
                                        padding: `${dd.itemPaddingY}px ${dd.itemPaddingX}px`,
                                        borderRadius: (dd.borderRadius as number) - 2,
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
                            </>
                          )}
                        </div>
                      </div>
                      <p style={{ fontSize: fc.noteSize, color: "var(--muted-foreground)", lineHeight: 1.4, margin: 0 }}>
                        {BROWSER_OPTIONS.find((b) => b.id === config.browser)?.note}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: sc.gap,
                  padding: `${sc.paddingY}px ${sc.paddingX}px`,
                  borderRadius: sc.borderRadius,
                  border: `1.5px solid ${isManual ? sc.activeBorder : sc.idleBorder}`,
                  background: isManual ? (sc.activeBg as string) : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "border-color 0.15s ease, background 0.15s ease",
                }}
              >
                <div
                  style={{
                    width: sc.iconSize,
                    height: sc.iconSize,
                    borderRadius: sc.iconRadius,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: isManual ? (sc.iconActiveBg as string) : (sc.iconBg as string),
                    color: isManual ? (sc.iconActiveColor as string) : (sc.iconColor as string),
                    flexShrink: 0,
                    transition: "background 0.15s ease, color 0.15s ease",
                  }}
                >
                  <HugeiconsIcon icon={LockIcon} size={sc.iconInner} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: sc.titleSize, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.3 }}>
                    Manually enter cookies
                  </div>
                  <div style={{ fontSize: sc.subtitleSize, color: "var(--muted-foreground)", marginTop: 2, lineHeight: 1.4 }}>
                    Paste ct0 and auth_token copied from browser DevTools
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
                    marginTop: 2,
                  }}
                >
                  <HugeiconsIcon icon={ChevronDownIcon} size={18} />
                </span>
              </button>

              <AnimatePresence initial={false}>
                {isManual && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    style={{ overflow: "hidden" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: fc.gap,
                        padding: `${fc.paddingY}px ${fc.paddingX}px`,
                        borderRadius: fc.borderRadius,
                        border: `1px solid ${fc.borderColor}`,
                        background: fc.bg as string,
                        marginLeft: p.Section.sectionPaddingX,
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
                            }}
                          />
                        </Field>
                      </div>
                      <p style={{ fontSize: fc.noteSize, color: "var(--muted-foreground)", lineHeight: 1.4, margin: 0 }}>
                        X.com → DevTools → Application → Cookies →{" "}
                        <code
                          style={{
                            borderRadius: 4,
                            border: "1px solid var(--border)",
                            background: "var(--background)",
                            padding: "1px 6px",
                            fontSize: fc.noteSize,
                          }}
                        >
                          ct0
                        </code>
                        {" & "}
                        <code
                          style={{
                            borderRadius: 4,
                            border: "1px solid var(--border)",
                            background: "var(--background)",
                            padding: "1px 6px",
                            fontSize: fc.noteSize,
                          }}
                        >
                          auth_token
                        </code>
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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
