/**
 * Cascade router v1 (shadow-mode): Regex → Local margin bands → Zen arbitration.
 *
 * Pure decision logic over precomputed provider evidence — it calls NO
 * providers and invents NO thresholds. Bands come from bands.json (dev-fit),
 * gates from regex-gates.json (gold-measured). Every decision carries
 * provenance; `zenRequired` tells callers whether the path needs Zen
 * (drives invocation-rate measurement and, later, phased execution).
 *
 * Evidence in: {regexLabel|null, localLabel, localMargin, localCandidates,
 *   zenLabel|null, zenStatus ("success"|failure…),
 *   contentFree?, thinEvidence?, tutorialCue?}
 * Decision out: {label, status, errorCode, provenance{decisionSource,
 *   decisionReason, localMargin, localCandidate, zenCandidate,
 *   regexRuleId|null, arbitration|null, tutorialCue, zenRequired}}
 *
 * Four-state semantics preserved; provider failure is a status, never a label.
 */
import { STATES } from "../contract.mjs";

export const CASCADE_VERSION = "v1";

function provenance(partial) {
  return {
    decisionSource: "undecided",
    decisionReason: "undecided",
    localMargin: null,
    localCandidate: null,
    zenCandidate: null,
    regexRuleId: null,
    arbitration: null,
    tutorialCue: null,
    zenRequired: false,
    ...partial,
  };
}

function accept(label, partial) {
  return {
    label,
    status: "success",
    errorCode: null,
    provenance: provenance({ decisionSource: "accept", ...partial }),
  };
}

function failed(errorCode, partial) {
  return {
    label: STATES.UNCLASSIFIED,
    status: errorCode,
    errorCode,
    provenance: provenance({ decisionSource: "failure", ...partial }),
  };
}

/**
 * @param {object} evidence
 * @param {{terminalLabels: Map<string,string>, bands: object}} config
 *   terminalLabels: label -> ruleId for promoted regex gates (often empty).
 *   bands: bands.json content ({fallback, classes}).
 */
export function route(evidence, config) {
  const { regexLabel = null, localLabel, localMargin, localCandidates = [], zenLabel = null, zenStatus = "success" } = evidence;
  const contentFree = evidence.contentFree === true;
  const thinEvidence = evidence.thinEvidence === true;
  const tutorialCue = typeof evidence.tutorialCue === "string" ? evidence.tutorialCue : null;
  const { terminalLabels, bands } = config;
  const base = {
    localMargin,
    localCandidate: localLabel,
    zenCandidate: zenLabel,
    regexRuleId: null,
    tutorialCue,
  };

  // 0. Content-free → unknown. Emptiness beats pattern matching: there is
  // nothing to classify, so no category (and no Zen call) is justified.
  if (contentFree) {
    return {
      label: STATES.UNKNOWN,
      status: "success",
      errorCode: null,
      provenance: provenance({ ...base, decisionSource: "evidence", decisionReason: "content-free", zenRequired: false }),
    };
  }

  // 1. Terminal regex gate (gold-promoted only; empty in v1).
  if (regexLabel !== null && terminalLabels.has(regexLabel)) {
    return accept(regexLabel, {
      ...base,
      decisionSource: "regex",
      decisionReason: "terminal-rule",
      regexRuleId: terminalLabels.get(regexLabel),
      zenRequired: false,
    });
  }

  // 2. Local margin band lookup (shared with requiresZen; arbitration-only
  // when unsupported so no threshold is ever invented here).
  const { highAt, abstainBelow } = bandFor(bands, localLabel);
  const inHighBand = highAt !== null && typeof localMargin === "number" && localMargin >= highAt;
  const inAbstainBand = abstainBelow !== null && typeof localMargin === "number" && localMargin < abstainBelow;

  // 3. High-confidence local → accept, unless the input is too thin for
  // acceptance to mean anything (tutorial framing counts as evidence and
  // bypasses the thin guard).
  if (inHighBand && !(thinEvidence && !tutorialCue)) {
    return accept(localLabel, {
      ...base,
      decisionSource: "local",
      decisionReason: "margin-band",
      zenRequired: false,
    });
  }

  // 3b. Thin evidence with no tutorial framing: agreement would be
  // confirmation of nothing, so preserve uncertainty without spending
  // a Zen call that would only guess on the same thin text.
  if (thinEvidence && !tutorialCue) {
    return {
      label: STATES.UNCERTAIN,
      status: "success",
      errorCode: null,
      provenance: provenance({ ...base, decisionSource: "evidence", decisionReason: "thin-evidence", zenRequired: false }),
    };
  }

  // From here the path needs Zen (arbitration or abstention routing).
  const zenFailed = zenStatus !== "success" || zenLabel === null;

  // 4. Abstain band → Zen; on Zen failure there is no safe local result.
  if (inAbstainBand) {
    if (zenFailed) return failed(zenStatus === "success" ? "failed" : zenStatus, { ...base, decisionReason: "abstain-band-zen-failed", zenRequired: true });
    return accept(zenLabel, {
      ...base,
      decisionSource: "zen",
      decisionReason: "abstain-band-arbitration",
      zenRequired: true,
    });
  }

  // 5. Arbitration band.
  if (zenFailed) {
    return failed(zenStatus === "success" ? "failed" : zenStatus, {
      ...base,
      decisionReason: "arbitration-zen-failed",
      zenRequired: true,
    });
  }
  // Tutorial override: explicit instructional framing plus technique ranked
  // in local's top candidates beats an agreement that never considered
  // intent. Narrow by construction (requires cue + ranked support).
  const localTop = Array.isArray(localCandidates) ? localCandidates.slice(0, 3) : [];
  if (tutorialCue && localTop.includes("technique")) {
    return accept("technique", {
      ...base,
      decisionSource: "agreement",
      decisionReason: "tutorial-evidence-override",
      arbitration: "local_wins",
      zenRequired: true,
    });
  }
  if (zenLabel === localLabel) {
    return accept(localLabel, {
      ...base,
      decisionSource: "agreement",
      decisionReason: "local-zen-agreement",
      arbitration: "agreement",
      zenRequired: true,
    });
  }
  // Tutorial framing breaks ties toward technique, ahead of the capability
  // default: explicit instructional evidence outweighs an unelaborated
  // other/unknown verdict. Never creates a category — technique only wins
  // when one side already claims it.
  if (tutorialCue && (localLabel === "technique") !== (zenLabel === "technique")) {
    const winner = localLabel === "technique" ? localLabel : zenLabel;
    return accept(winner, {
      ...base,
      decisionSource: "agreement",
      decisionReason: "tutorial-evidence",
      arbitration: localLabel === "technique" ? "local_wins" : "zen_wins",
      zenRequired: true,
    });
  }
  // Zen capability the local head lacks (other/unknown): accept Zen.
  if (zenLabel === STATES.OTHER || zenLabel === STATES.UNKNOWN) {
    return accept(zenLabel, {
      ...base,
      decisionSource: "zen",
      decisionReason: "other-unknown-capability",
      arbitration: "zen_wins",
      zenRequired: true,
    });
  }
  // Regex corroboration breaks the tie toward the corroborated side.
  if (regexLabel !== null && regexLabel === localLabel) {
    return accept(localLabel, {
      ...base,
      decisionSource: "agreement",
      decisionReason: "regex-corroborates-local",
      arbitration: "local_wins",
      zenRequired: true,
    });
  }
  if (regexLabel !== null && regexLabel === zenLabel) {
    return accept(zenLabel, {
      ...base,
      decisionSource: "agreement",
      decisionReason: "regex-corroborates-zen",
      arbitration: "zen_wins",
      zenRequired: true,
    });
  }
  // Unresolved: preserve both candidates, commit to neither.
  return {
    label: STATES.UNCERTAIN,
    status: "success",
    errorCode: null,
    provenance: provenance({
      ...base,
      decisionSource: "arbitration",
      decisionReason: "unresolved-disagreement",
      arbitration: "unresolved",
      zenRequired: true,
    }),
  };
}

/** Build the terminal-label map from a regex-gates.json object. */
export function terminalMap(gates) {
  const map = new Map();
  for (const g of gates?.terminal || []) map.set(g.label, g.ruleId);
  return map;
}

/** Shared band lookup: returns {banded, highAt, abstainBelow} for a label. */
function bandFor(bands, localLabel) {
  const band = (bands.classes || {})[localLabel];
  const banded = !!band && band.mode === "banded";
  const highAt = banded ? band.highAt : null;
  const abstainBelow = banded && band.abstainBelow !== null && band.abstainBelow !== undefined
    ? Math.min(band.abstainBelow, band.highAt)
    : null;
  return { banded, highAt, abstainBelow };
}

/**
 * Pre-check used by phased execution: does this evidence require a Zen
 * call? False for content-free (unknown direct), thin-without-tutorial
 * (uncertain direct), terminal gates, and high-band accepts. Shares the
 * exact conditions with route() so the two can never disagree.
 */
export function requiresZen(evidence, config) {
  if (evidence.contentFree === true) return false;
  if (evidence.thinEvidence === true && typeof evidence.tutorialCue !== "string") return false;
  const { regexLabel = null, localLabel, localMargin } = evidence;
  if (regexLabel !== null && config.terminalLabels.has(regexLabel)) return false;
  const { highAt } = bandFor(config.bands, localLabel);
  if (highAt !== null && typeof localMargin === "number" && localMargin >= highAt) {
    if (evidence.thinEvidence === true) return true; // tutorial bypass re-checks below
    return false;
  }
  return true;
}
