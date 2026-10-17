/**
 * Formalize the 49-row uncertain audit (audit batch v1).
 *
 * Joins reviewer judgments with the production run ledger so every
 * disposition is traceable to its source predictions and text. Fails
 * loudly if the run does not contain exactly the judged rows, so the
 * manifest can never silently drift from the evidence.
 *
 * Disposition taxonomy (primary, mutually exclusive):
 *   thin-evidence  — no classifiable content; unresolved by design
 *   ambiguous      — two or more defensible head labels; no single answer
 *   resolvable     — a single label is determinable yet the outcome was
 *                    uncertain. Sub-flagged:
 *                      escape-hatch = correct label WAS in evidence
 *                                    (local or zen proposed it)
 *                      both-wrong   = correct label was NOT in evidence
 *
 * Secondary flags (may overlap any disposition):
 *   localWrong  — local's top candidate is plainly wrong
 *   tutorialCue — instructional framing present in text
 *   boundary    — the competing label pair
 *
 * Usage: node lib/classify/eval/build-audit-manifest.mjs [--out <path>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../../../node_modules/fieldtheory/dist/db.js";
import { twitterBookmarksIndexPath } from "../../../node_modules/fieldtheory/dist/paths.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN = "run-2026-09-29T08-57-28-934Z.json";

/**
 * Reviewer judgments, keyed by bookmark id.
 *   [disposition, correctLabel|null, localWrong, tutorialCue|null, boundary, note]
 * correctLabel is null when no single answer is determinable.
 */
const J = {
  "2100163930643423338": ["ambiguous", null, false, null, "design/opinion", "post asks if effort was worth it; commentary or design share both defensible"],
  "2096666329495257563": ["ambiguous", null, false, null, "technique/opinion", "question soliciting techniques; technique vs opinion both defensible"],
  "2103098372177686597": ["resolvable", "launch", true, null, "launch/education", "one-line product pointer; zen proposed launch, local proposed education"],
  "2083197007552737460": ["thin-evidence", null, false, null, null, "two words plus media link; nothing classifiable"],
  "2100536131280367976": ["ambiguous", null, false, null, "launch/tool", "shared demos plus a tool reference; both defensible"],
  "2101027385734783283": ["ambiguous", null, false, null, "launch/opinion", "showcase of generated launch video; launch vs opinion"],
  "2082142315317985695": ["ambiguous", null, false, null, "launch/design", "WIP site for a product; launch vs design"],
  "2099162438016901449": ["ambiguous", null, false, null, "launch/tool", "skill for UI motion; launch vs tool"],
  "2095546063100809704": ["resolvable", "launch", false, null, "launch/opinion", "update note with feature list; zen proposed launch"],
  "2086614371317297350": ["ambiguous", null, false, null, "education/design", "portfolio milestone with case-study framing"],
  "2099497518627184949": ["thin-evidence", null, false, null, null, "two words plus media link"],
  "2083189736848445781": ["ambiguous", null, false, null, "launch/opinion", "work-share credit for a releases section"],
  "2100596949829484740": ["ambiguous", null, false, null, "tool/opinion", "reaction post about a new model; opinion vs tool"],
  "2087569590268391897": ["thin-evidence", null, false, null, null, "bare x.com article link"],
  "2086038697548329260": ["resolvable", "launch", false, null, "launch/opinion", "shipped-to-prod note with domain; zen proposed launch"],
  "2085451190628716936": ["resolvable", "launch", false, null, "launch/tool", "tool teaser; zen proposed launch"],
  "2084637478699348014": ["ambiguous", null, false, null, "design/opinion", "menu animation share; design vs opinion"],
  "2088258582579961922": ["ambiguous", null, false, null, "launch/technique", "build log for a chat-status feature"],
  "2082750271805874629": ["thin-evidence", null, false, null, null, "praise reply, no content"],
  "2073030840787800415": ["resolvable", "tool", true, null, "tool/design", "installable skill announced with npx command; neither side proposed tool"],
  "2096186804408078674": ["ambiguous", null, false, null, "tool/opinion", "editor capability boast; tool vs opinion"],
  "2085408734550130725": ["ambiguous", null, false, null, "design/opinion", "praise for a design team's work; design vs opinion"],
  "2103342411581882811": ["ambiguous", null, false, null, "design/opinion", "self-question about sharing work"],
  "2082496873655648632": ["ambiguous", null, false, null, "launch/tool", "building an operating system; launch vs tool"],
  "2083121320876020223": ["ambiguous", null, false, null, "launch/design", "copy-paste component resource list"],
  "2082690348418273695": ["ambiguous", null, false, null, "tool/opinion", "short reaction naming several tools"],
  "2102326921807659506": ["resolvable", "design", true, null, "design/security", "UI design opinion; zen proposed design, local proposed security"],
  "2095921079361675771": ["thin-evidence", null, false, null, null, "three words plus media link"],
  "2102041252833497443": ["ambiguous", null, false, null, "launch/opinion", "open-source release commentary; launch vs opinion"],
  "2089422236189118488": ["ambiguous", null, false, null, "education/research", "bare source link; near-thin but four tokens so not caught"],
  "2084964396271374817": ["ambiguous", null, false, null, "design/opinion", "portfolio pointer; design vs opinion"],
  "2082120556007116840": ["ambiguous", null, false, null, "education/design", "praise reply naming a site"],
  "2088655628499873862": ["resolvable", "tool", true, null, "tool/career", "tool screenshot caption; zen proposed tool, local proposed career"],
  "2085426327755038987": ["resolvable", "technique", true, null, "technique/career", "instructional implementation list; zen proposed technique, local proposed career"],
  "2084317495448461585": ["ambiguous", null, true, null, "launch/design", "demo link pointer; local proposed education which is plainly wrong"],
  "2100920755315789926": ["thin-evidence", null, false, null, null, "two-word praise reply"],
  "2084189292146970689": ["resolvable", "tool", true, null, "tool/education", "skill path pointer; zen proposed tool, local proposed education"],
  "1992232348025344003": ["thin-evidence", null, false, null, null, "midjourney parameters only; unseen media"],
  "2100470174130250127": ["ambiguous", null, false, null, "tool/opinion", "project rebuild write-up; tool vs opinion"],
  "2102955084644864133": ["resolvable", "launch", false, null, "launch/opinion", "anticipation post for a brand launch; zen proposed launch"],
  "2097258328292249947": ["thin-evidence", null, false, null, null, "product name plus media link"],
  "2096184499016999199": ["ambiguous", null, false, null, "launch/design", "UI library build note; launch vs design"],
  "2087520044196507963": ["ambiguous", null, false, "tip", "technique/opinion", "design-engineering tip post; cue list matches 'tips' but not 'Tip:'"],
  "1833618067261178207": ["ambiguous", null, false, null, "technique/opinion", "demo pointer with casual commentary"],
  "2100694549362553153": ["ambiguous", null, false, null, "tool/opinion", "use-case commentary naming a tool"],
  "2093956976523038819": ["ambiguous", null, false, null, "launch/tool", "component demo pointer; launch vs tool"],
  "2082879097240531411": ["ambiguous", null, false, null, "launch/tool", "tool build announcement; launch vs tool"],
  "2082923377774264389": ["resolvable", "design", true, null, "design/security", "UI component WIP; local proposed security which is plainly wrong"],
  "2093800904440889815": ["thin-evidence", null, false, null, null, "two words plus media link"],
};

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const outPath = outIdx !== -1
    ? resolve(process.cwd(), args[outIdx + 1])
    : join(HERE, "audit-manifest-v1.json");

  const run = JSON.parse(readFileSync(join(HERE, "..", "..", "..", "data", "output", "classify-runs", RUN), "utf8"));
  const uncertain = run.results.filter((r) => r.label === "uncertain");
  const runIds = new Set(uncertain.map((r) => r.id));
  const judgedIds = new Set(Object.keys(J));

  // Traceability gates — a mismatch means the manifest no longer describes
  // the evidence it claims to.
  const unjudged = [...runIds].filter((id) => !judgedIds.has(id));
  const orphanJudged = [...judgedIds].filter((id) => !runIds.has(id));
  if (unjudged.length > 0 || orphanJudged.length > 0) {
    throw new Error(
      `manifest/run mismatch: unjudged=${unjudged.length} orphan=${orphanJudged.length} ` +
      `(run=${runIds.size} judged=${judgedIds.size})`
    );
  }

  const db = await openDb(twitterBookmarksIndexPath());
  const quoted = [...runIds].map((id) => `'${id}'`).join(",");
  const res = db.exec(`SELECT id, substr(text, 1, 160) FROM bookmarks WHERE id IN (${quoted})`);
  const excerpts = new Map((res[0]?.values || []).map((v) => [String(v[0]), v[1] || ""]));
  if (typeof db.close === "function") {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }

  const rows = uncertain.map((r) => {
    const [disposition, correctLabel, localWrong, tutorialCue, boundary, note] = J[r.id];
    const escapeHatch = disposition === "resolvable" && r.decision.zenCandidate === correctLabel;
    const bothWrong = disposition === "resolvable" && !escapeHatch;
    return {
      id: r.id,
      runId: run.runId,
      textExcerpt: excerpts.get(r.id) ?? "",
      evidence: {
        localCandidate: r.decision.localCandidate,
        zenCandidate: r.decision.zenCandidate,
        localMargin: r.decision.localMargin,
        decisionReason: r.decision.decisionReason,
        tutorialCue: r.decision.tutorialCue ?? null,
      },
      audit: {
        disposition,
        correctLabel: correctLabel ?? null,
        localWrong,
        escapeHatch,
        bothWrong,
        tutorialCueInText: tutorialCue,
        tutorialCueDetected: r.decision.tutorialCue ?? null,
        boundary,
        note,
      },
    };
  });

  const counts = { total: rows.length };
  for (const key of ["thin-evidence", "ambiguous", "resolvable"]) {
    counts[key] = rows.filter((r) => r.audit.disposition === key).length;
  }
  counts.escapeHatch = rows.filter((r) => r.audit.escapeHatch).length;
  counts.bothWrong = rows.filter((r) => r.audit.bothWrong).length;
  counts.localWrong = rows.filter((r) => r.audit.localWrong).length;
  counts.tutorialCueInText = rows.filter((r) => r.audit.tutorialCueInText).length;
  counts.tutorialCueMissed = rows.filter(
    (r) => r.audit.tutorialCueInText && !r.audit.tutorialCueDetected
  ).length;

  const manifest = {
    version: "audit-v1",
    runId: run.runId,
    frozenAt: new Date().toISOString(),
    scope: "uncertain rows from one production cascade run on the unclassified corpus",
    counts,
    rows,
  };
  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`wrote ${outPath}`);
  console.log(JSON.stringify(counts, null, 2));
}

main().catch((err) => {
  console.error(`build-audit-manifest failed: ${err.message}`);
  process.exitCode = 1;
});
