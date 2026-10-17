/** Eval integrity unit tests: dedup, language signal, slug validation. Offline. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeText,
  textHash,
  exactDupGroups,
  nearDupPairs,
  unionComponents,
} from "../classify/eval/dedup.mjs";
import { languageSignal } from "../classify/eval/build-dataset-v2.mjs";
import { validateSlug, getTaxonomy } from "../classify/taxonomy.mjs";

describe("dedup normalization", () => {
  it("treats retweets/links/mentions as identical", () => {
    const a = "Check this out https://t.co/abc @user!";
    const b = "check this out https://t.co/xyz @other?";
    assert.equal(textHash(a), textHash(b));
  });

  it("keeps genuinely different texts apart", () => {
    assert.notEqual(textHash("hello world"), textHash("hello there world"));
  });

  it("groups exact duplicates and maps members", () => {
    const { groups, groupOf } = exactDupGroups([
      { id: "1", text: "Same post https://t.co/1" },
      { id: "2", text: "same post https://t.co/2" },
      { id: "3", text: "Different post entirely" },
    ]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].ids, ["1", "2"]);
    assert.equal(groupOf.get("1"), groupOf.get("2"));
    assert.equal(groupOf.get("3"), undefined);
  });

  it("finds near-duplicates above threshold only", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const vectors = [[1, 0], [0.999, 0.045], [0, 1]];
    const pairs = nearDupPairs(items, vectors, 0.97);
    assert.equal(pairs.length, 1);
    assert.deepEqual([pairs[0].a, pairs[0].b], ["a", "b"]);
    assert.deepEqual(nearDupPairs(items, vectors, 0.9999), []);
  });

  it("unions exact and near groups into stay-together components", () => {
    const comps = unionComponents(
      [{ hash: "h", ids: ["1", "2"] }],
      [{ a: "2", b: "3", similarity: 0.99 }]
    );
    assert.deepEqual(comps, [["1", "2", "3"]]);
  });
});

describe("language signal", () => {
  it("reports english as latin-dominant", () => {
    const s = languageSignal("Hello world, this is a test post!");
    assert.ok(s.nonLatinShare < 0.1);
    assert.deepEqual(s.scripts, ["latin"]);
  });

  it("flags heavily non-latin text without claiming a language", () => {
    const s = languageSignal("日本語のテスト投稿です、こんにちは");
    assert.ok(s.nonLatinShare > 0.3);
    assert.ok(s.scripts.includes("cjk"));
  });

  it("handles empty text", () => {
    assert.deepEqual(languageSignal(""), { nonLatinShare: 0, scripts: [] });
  });
});

describe("slug validation boundary", () => {
  it("accepts known slugs with canonical mapping", () => {
    assert.deepEqual(validateSlug("Tool"), { ok: true, canonical: "tool" });
  });

  it("marks unknown slugs invalid (never silent other)", () => {
    assert.deepEqual(validateSlug("not-a-real-category"), { ok: false, invalid: true });
    assert.deepEqual(validateSlug(null), { ok: false, invalid: true });
  });

  it("taxonomy carries an experimental version", () => {
    assert.equal(getTaxonomy().version, "experimental-001");
  });
});
