"use client";

import { useState, useEffect, useCallback } from "react";
import { useDialKit } from "dialkit";
import { syncSettingsDialConfig } from "@/components/ui/sync-settings-dial-config";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/animate-ui/components/radix/popover'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckIcon, ChevronDownIcon } from '@hugeicons/core-free-icons'

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
  source: "auto" | "manual";
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
    source: "auto",
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
      const res = await fetch("/api/cookies");
      if (!res.ok) return;
      const data = await res.json();
      setConfig((prev) => ({
        ...prev,
        source: data.config?.source || "auto",
        browser: data.config?.browser || "firefox",
      }));
      setCookieMode(data.cookieMode);
    } catch {
      /* API unavailable */
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
      const res = await fetch("/api/cookies", {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="ring-0"
        style={{
          padding: `${p.Card.paddingY as number}px ${p.Card.paddingX as number}px`,
          borderRadius: p.Card.borderRadius as number,
          background: p.Card.cardBg as string,
          gap: p.Card.cardGap as number,
        }}
        showCloseButton={false}
      >
        <button
          type="button"
          aria-label="Close"
          style={{
            position: "absolute",
            top: p.CloseBtn.btnTop as number,
            right: p.CloseBtn.btnRight as number,
            width: p.CloseBtn.btnSize as number,
            height: p.CloseBtn.btnSize as number,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            color: p.CloseBtn.iconColor as string,
            background: p.CloseBtn.btnBg as string,
            transition: "background 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = p.CloseBtn.btnHoverBg as string
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = p.CloseBtn.btnBg as string
          }}
          onClick={() => onOpenChange(false)}
        >
          <svg
            width={p.CloseBtn.iconSize as number}
            height={p.CloseBtn.iconSize as number}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <DialogHeader style={{ gap: p.Header.headerGap as number }}>
          <DialogTitle
            style={{ fontSize: p.Header.titleSize as number }}
          >
            Sync Settings
          </DialogTitle>
          <DialogDescription
            style={{ fontSize: p.Header.descriptionSize as number }}
          >
            Choose how to provide X / Twitter cookies for syncing.
          </DialogDescription>
        </DialogHeader>

        {/* Auto-detect row */}
        <div style={{ display: "flex", flexDirection: "column", gap: p.RadioRow.optionGap as number }}>
          <label
            className="flex items-start cursor-pointer group"
            style={{ gap: p.RadioRow.radioGap as number }}
          >
            <input
              type="radio"
              name="cookie-source"
              className="mt-0.5 accent-foreground shrink-0"
              checked={config.source === "auto"}
              onChange={() => setConfig((p) => ({ ...p, source: "auto" }))}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span
                className="font-medium leading-none group-hover:text-foreground transition-colors"
                style={{ fontSize: p.RadioRow.labelSize as number }}
              >
                Auto-detect from browser
              </span>
              <span
                className="text-muted-foreground"
                style={{ fontSize: p.RadioRow.subtitleSize as number }}
              >
                Field Theory extracts cookies directly from the browser
              </span>
            </div>
          </label>

          {config.source === "auto" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: p.Input.inputGap as number,
                paddingLeft: p.RadioRow.indentLeft as number,
              }}
            >
              <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    style={{
                      height: p.Input.height as number,
                      borderRadius: p.Input.borderRadius as number,
                      paddingLeft: p.Input.paddingX as number,
                      paddingRight: p.Input.paddingX as number,
                      fontSize: p.Input.fontSize as number,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      cursor: "pointer",
                    }}
                    className="border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                      <HugeiconsIcon icon={ChevronDownIcon} size={14} />
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={4}
                  className="w-auto border-0 shadow-lg p-1"
                  style={{
                    backgroundColor: "var(--popover)",
                    borderRadius: p.Input.borderRadius as number,
                    minWidth: p.Input.dropdownWidth as number,
                  }}
                >
                  <div className="flex flex-col" style={{ gap: 2 }}>
                    {BROWSER_OPTIONS.map((b) => {
                      const selected = config.browser === b.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setConfig((prev) => ({ ...prev, browser: b.id }))}
                          className="flex w-full items-center gap-2 text-left text-sm font-medium outline-none cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                          style={{
                            padding: "6px 10px",
                            borderRadius: (p.Input.borderRadius as number) - 2,
                            color: selected ? "var(--foreground)" : "var(--foreground)",
                          }}
                        >
                          <span style={{ width: 16, display: "flex", alignItems: "center", flexShrink: 0 }}>
                            {selected && (
                              <HugeiconsIcon icon={CheckIcon} size={14} />
                            )}
                          </span>
                          <span>{b.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
              <p
                className="text-muted-foreground leading-relaxed"
                style={{ fontSize: p.Input.noteSize as number }}
              >
                {BROWSER_OPTIONS.find((b) => b.id === config.browser)?.note}
              </p>
            </div>
          )}
        </div>

        {/* Manual row */}
        <div style={{ display: "flex", flexDirection: "column", gap: p.RadioRow.optionGap as number }}>
          <label
            className="flex items-start cursor-pointer group"
            style={{ gap: p.RadioRow.radioGap as number }}
          >
            <input
              type="radio"
              name="cookie-source"
              className="mt-0.5 accent-foreground shrink-0"
              checked={config.source === "manual"}
              onChange={() => setConfig((p) => ({ ...p, source: "manual" }))}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span
                className="font-medium leading-none group-hover:text-foreground transition-colors"
                style={{ fontSize: p.RadioRow.labelSize as number }}
              >
                Manually enter cookies
              </span>
              <span
                className="text-muted-foreground"
                style={{ fontSize: p.RadioRow.subtitleSize as number }}
              >
                Paste ct0 and auth_token from browser DevTools
              </span>
            </div>
          </label>

          {config.source === "manual" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: p.Input.inputGap as number,
                paddingLeft: p.RadioRow.indentLeft as number,
              }}
            >
              <input
                type="password"
                placeholder="ct0"
                style={{
                  height: p.Input.height as number,
                  borderRadius: p.Input.borderRadius as number,
                  paddingLeft: p.Input.paddingX as number,
                  paddingRight: p.Input.paddingX as number,
                  fontSize: p.Input.fontSize as number,
                }}
                className="border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={config.ct0}
                onChange={(e) =>
                  setConfig((p) => ({ ...p, ct0: e.target.value }))
                }
              />
              <input
                type="password"
                placeholder="auth_token"
                style={{
                  height: p.Input.height as number,
                  borderRadius: p.Input.borderRadius as number,
                  paddingLeft: p.Input.paddingX as number,
                  paddingRight: p.Input.paddingX as number,
                  fontSize: p.Input.fontSize as number,
                }}
                className="border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={config.authToken}
                onChange={(e) =>
                  setConfig((p) => ({ ...p, authToken: e.target.value }))
                }
              />
              <p
                className="text-muted-foreground leading-relaxed"
                style={{ fontSize: p.Input.noteSize as number }}
              >
                X.com → DevTools → Application → Cookies →{" "}
                <code className="bg-muted px-1 py-0.5 rounded" style={{ fontSize: p.Input.noteSize as number }}>
                  ct0
                </code>
                {" & "}
                <code className="bg-muted px-1 py-0.5 rounded" style={{ fontSize: p.Input.noteSize as number }}>
                  auth_token
                </code>
              </p>
            </div>
          )}
        </div>

        {/* Status bar */}
        {showSaved && (
          <div
            className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            style={{
              borderRadius: p.Status.borderRadius as number,
              padding: `${p.Status.paddingY as number}px ${p.Status.paddingX as number}px`,
              fontSize: p.Status.fontSize as number,
            }}
          >
            Settings saved
          </div>
        )}

        {!showSaved && cookieMode && (
          <div
            style={{
              borderRadius: p.Status.borderRadius as number,
              padding: `${p.Status.paddingY as number}px ${p.Status.paddingX as number}px`,
              fontSize: p.Status.fontSize as number,
            }}
            className={
              cookieMode.includes("auto") || cookieMode === "manual-runtime"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : cookieMode === "manual-incomplete"
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : "bg-muted text-muted-foreground"
            }
          >
            {COOKIE_MODE_LABELS[cookieMode] || cookieMode}
          </div>
        )}

        {error && (
          <div
            className="bg-red-500/10 text-red-700 dark:text-red-400"
            style={{
              borderRadius: p.Status.borderRadius as number,
              padding: `${p.Status.paddingY as number}px ${p.Status.paddingX as number}px`,
              fontSize: p.Status.fontSize as number,
            }}
          >
            {error}
          </div>
        )}

        <div
          className="flex flex-col-reverse sm:flex-row sm:justify-end"
          style={{
            gap: p.Footer.footerGap as number,
            padding: `${p.Card.paddingY as number}px ${p.Card.paddingX as number}px`,
            margin: `0 calc(${p.Card.paddingX as number}px * -1) calc(${p.Card.paddingY as number}px * -1)`,
            borderTop: "1px solid var(--border)",
            background: "var(--muted)",
            borderBottomLeftRadius: p.Card.borderRadius as number,
            borderBottomRightRadius: p.Card.borderRadius as number,
          }}
        >
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            style={{
              height: p.Footer.buttonHeight as number,
              paddingLeft: p.Footer.buttonPaddingX as number,
              paddingRight: p.Footer.buttonPaddingX as number,
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{
              height: p.Footer.buttonHeight as number,
              paddingLeft: p.Footer.buttonPaddingX as number,
              paddingRight: p.Footer.buttonPaddingX as number,
            }}
          >
            {saving ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
