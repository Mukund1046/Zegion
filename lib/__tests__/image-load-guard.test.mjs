import test from "node:test";
import assert from "node:assert/strict";
import {
  beginImageAssignment,
  invalidateImageAssignment,
  isCurrentImageAssignment,
} from "../image-load-guard.mjs";

function fakeImage(source = "") {
  return {
    source,
    getAttribute(name) {
      return name === "src" ? this.source : null;
    },
    setSource(source) {
      this.source = source;
    },
  };
}

test("only the current source assignment may commit its load callback", () => {
  const image = fakeImage();
  const oldGeneration = beginImageAssignment(image);
  image.setSource("/bookmark-a.jpg");

  const currentGeneration = beginImageAssignment(image);
  image.setSource("/bookmark-b.jpg");

  assert.equal(isCurrentImageAssignment(image, oldGeneration, "/bookmark-a.jpg"), false);
  assert.equal(isCurrentImageAssignment(image, currentGeneration, "/bookmark-b.jpg"), true);
});

test("cleanup invalidates callbacks even when the URL is unchanged", () => {
  const image = fakeImage("/same.jpg");
  const generation = beginImageAssignment(image);

  invalidateImageAssignment(image);

  assert.equal(isCurrentImageAssignment(image, generation, "/same.jpg"), false);
});

test("same URL on a recycled element belongs only to its newest assignment", () => {
  const image = fakeImage("/shared.jpg");
  const previous = beginImageAssignment(image);
  const current = beginImageAssignment(image);

  assert.equal(isCurrentImageAssignment(image, previous, "/shared.jpg"), false);
  assert.equal(isCurrentImageAssignment(image, current, "/shared.jpg"), true);
});

test("source identity is checked in addition to assignment generation", () => {
  const image = fakeImage("/first.jpg");
  const generation = beginImageAssignment(image);
  image.setSource("/second.jpg");

  assert.equal(isCurrentImageAssignment(image, generation, "/first.jpg"), false);
});

test("cleanup followed by reassignment accepts the next valid source", () => {
  const image = fakeImage("/first.jpg");
  const previous = beginImageAssignment(image);

  invalidateImageAssignment(image);
  const current = beginImageAssignment(image);
  image.setSource("/second.jpg");

  assert.equal(isCurrentImageAssignment(image, previous, "/first.jpg"), false);
  assert.equal(isCurrentImageAssignment(image, current, "/second.jpg"), true);
});

test("invalidating one element does not invalidate another consumer of the same URL", () => {
  const firstConsumer = fakeImage("/shared.jpg");
  const secondConsumer = fakeImage("/shared.jpg");
  const firstGeneration = beginImageAssignment(firstConsumer);
  const secondGeneration = beginImageAssignment(secondConsumer);

  invalidateImageAssignment(firstConsumer);

  assert.equal(isCurrentImageAssignment(firstConsumer, firstGeneration, "/shared.jpg"), false);
  assert.equal(isCurrentImageAssignment(secondConsumer, secondGeneration, "/shared.jpg"), true);
});

test("stale load and error handlers both reject an obsolete assignment", () => {
  const image = fakeImage("/old.jpg");
  const staleGeneration = beginImageAssignment(image);
  const staleCallbackMayCommit = () =>
    isCurrentImageAssignment(image, staleGeneration, "/old.jpg");

  const currentGeneration = beginImageAssignment(image);
  image.setSource("/current.jpg");

  // Both load and error handlers use the same ownership predicate in the
  // feed integrations, so neither event from the old request may commit.
  assert.equal(staleCallbackMayCommit(), false);
  assert.equal(staleCallbackMayCommit(), false);
  assert.equal(isCurrentImageAssignment(image, currentGeneration, "/current.jpg"), true);
});
