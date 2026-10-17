/**
 * CascadeProvider — production Regex → Local → Zen arbitration.
 *
 * Phased execution, all routing logic owned by cascade.mjs:
 *  1. Run regex + local providers over the batch (cheap, offline).
 *  2. requiresZen() decides per item whether Zen is needed (terminal
 *     gates + validated high bands resolve without it).
 *  3. Only the Zen-required subset goes to the Zen provider, batched.
 *  4. Every item is routed to a decision with full provenance.
 *
 * Reversible and additive: local-only and Zen-only paths are untouched,
 * and disabling the cascade means selecting a different provider name.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertProviderShape, createResult } from "../contract.mjs";
import { route, terminalMap, requiresZen, CASCADE_VERSION } from "./cascade.mjs";
import { isContentFree, isThinEvidence, detectTutorialIntent } from "./evidence.mjs";
import { createRegexProvider } from "../regex.mjs";
import { createLocalMLProvider } from "../local/provider.mjs";
import { createOpenCodeProvider } from "../opencode/provider.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function createCascadeProvider(overrides = {}) {
  const bands = overrides.bands || loadJson(join(HERE, "bands.json"));
  const gates = overrides.gates || loadJson(join(HERE, "regex-gates.json"));
  const config = { terminalLabels: terminalMap(gates), bands };
  const regex = overrides.regex || createRegexProvider();
  const local = overrides.local || createLocalMLProvider(overrides.localOptions || {});
  const zen = overrides.zen || createOpenCodeProvider(overrides.zenOptions || {});

  const provider = {
    name: "cascade",
    version: CASCADE_VERSION,
    config: { bands: bands.version, gates: gates.version },
    async classifyBatch(items) {
      if (!items || items.length === 0) return [];
      const startedMs = Date.now();
      const [regexResults, localResults] = await Promise.all([
        regex.classifyBatch(items),
        local.classifyBatch(items),
      ]);
      const regexById = new Map(regexResults.map((r) => [r.id, r.label]));
      const localById = new Map(localResults.map((r) => [r.id, r]));

      // Phase 1: decide per item whether Zen is required (no Zen calls).
      const pending = [];
      const decided = new Map(); // id -> decision
      for (const item of items) {
        const localRes = localById.get(item.id);
        if (!localRes) {
          // Local produced nothing: abstain path needs Zen; without it,
          // this item stays unclassified rather than guessed.
          pending.push({ item, localRes: null });
          continue;
        }
        const ranked = Object.entries(localRes.scores || {}).sort((a, b) => b[1] - a[1]);
        const tutorialCue = detectTutorialIntent(item.text);
        const evidence = {
          regexLabel: regexById.get(item.id) ?? null,
          localLabel: localRes.label,
          localMargin: ranked.length > 1 ? ranked[0][1] - ranked[1][1] : null,
          localCandidates: ranked.map(([label]) => label),
          contentFree: isContentFree(item.text),
          thinEvidence: isThinEvidence(item.text),
          tutorialCue,
        };
        if (!requiresZen(evidence, config)) {
          decided.set(item.id, { evidence, zen: null });
        } else {
          pending.push({ item, localRes, evidence });
        }
      }

      // Phase 2: Zen only for the subset that requires it, in one batch.
      const zenById = new Map();
      const zenFailed = new Map(); // id -> errorCode
      if (pending.length > 0) {
        try {
          const zenResults = await zen.classifyBatch(pending.map((p) => p.item));
          for (const r of zenResults) zenById.set(r.id, r.label);
        } catch (err) {
          const code = err.classifyCode || "failed";
          for (const p of pending) zenFailed.set(p.item.id, code);
        }
      }

      // Phase 3: route every item to a decision with provenance.
      const latencyMs = Date.now() - startedMs;
      const pendingById = new Map(pending.map((p) => [p.item.id, p]));
      const results = [];
      for (const item of items) {
        if (decided.has(item.id)) {
          const { evidence } = decided.get(item.id);
          const decision = route({ ...evidence, zenLabel: null, zenStatus: "success" }, config);
          results.push(toResult(item.id, decision, latencyMs));
          continue;
        }
        const entry = pendingById.get(item.id);
        const code = zenFailed.get(item.id);
        if (code) {
          const decision = route({ ...entry.evidence, zenLabel: null, zenStatus: code }, config);
          results.push(toResult(item.id, decision, latencyMs));
          continue;
        }
        const decision = route({ ...entry.evidence, zenLabel: zenById.get(item.id) ?? null, zenStatus: "success" }, config);
        results.push(toResult(item.id, decision, latencyMs));
      }
      return results;
    },
  };
  assertProviderShape(provider);
  return provider;
}

function toResult(id, decision, latencyMs) {
  const provenance = decision.provenance || {};
  // Full decision provenance rides alongside (not inside) the contract
  // result — createResult() only carries contract fields.
  const decisionRecord = {
    decisionSource: provenance.decisionSource,
    decisionReason: provenance.decisionReason,
    localMargin: provenance.localMargin ?? null,
    localCandidate: provenance.localCandidate ?? null,
    zenCandidate: provenance.zenCandidate ?? null,
    regexRuleId: provenance.regexRuleId ?? null,
    arbitration: provenance.arbitration ?? null,
    tutorialCue: provenance.tutorialCue ?? null,
    zenRequired: !!provenance.zenRequired,
  };
  return {
    id,
    ...createResult({
      label: decision.label,
      confidence: null,
      scores: null,
      candidates: [
        ...new Set(
          [provenance.localCandidate, provenance.zenCandidate, decision.label].filter(Boolean)
        ),
      ],
      provider: "cascade",
      model: `cascade-v1`,
      latencyMs,
      version: CASCADE_VERSION,
      fallbackUsed: provenance.decisionSource === "zen",
      status: decision.status,
      errorCode: decision.errorCode,
    }),
    decision: decisionRecord,
  };
}
