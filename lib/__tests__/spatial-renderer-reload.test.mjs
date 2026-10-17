import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { beginImageAssignment, invalidateImageAssignment, isCurrentImageAssignment } from "../image-load-guard.mjs";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.attributes = new Map();
    this.classNames = new Set();
    this.textContent = "";
    this.complete = false;
    this.naturalWidth = 0;
    this.onload = null;
    this.onerror = null;
    this.classList = {
      add: (...names) => names.forEach((name) => this.classNames.add(name)),
      remove: (...names) => names.forEach((name) => this.classNames.delete(name)),
      contains: (name) => this.classNames.has(name),
      toggle: (name, force) => {
        const shouldAdd = force ?? !this.classNames.has(name);
        if (shouldAdd) this.classNames.add(name);
        else this.classNames.delete(name);
        return shouldAdd;
      },
    };
  }

  set className(value) {
    this.classNames = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  get className() {
    return [...this.classNames].join(" ");
  }

  set innerHTML(value) {
    this.children = [];
    if (!value) return;
    const media = new FakeElement("div");
    media.className = "grid-item-media";
    media.appendChild(new FakeElement("img"));
    this.appendChild(media);
    if (value.includes("grid-item-head")) {
      const head = new FakeElement("div");
      head.className = "grid-item-head";
      const author = new FakeElement("div");
      author.className = "grid-item-author";
      const handle = new FakeElement("a");
      handle.className = "grid-item-handle";
      head.appendChild(author);
      head.appendChild(handle);
      this.appendChild(head);
    }
    if (value.includes("grid-item-text")) {
      const text = new FakeElement("div");
      text.className = "grid-item-text";
      this.appendChild(text);
    }
  }

  get innerHTML() {
    return "";
  }

  set src(value) {
    this.setAttribute("src", value);
    this.complete = false;
    this.naturalWidth = 0;
  }

  get src() {
    return this.getAttribute("src") ?? "";
  }

  appendChild(child) {
    if (child.tagName === "#FRAGMENT") {
      for (const nested of [...child.children]) this.appendChild(nested);
      child.children = [];
      return child;
    }
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  querySelector(selector) {
    const matches = (node) => {
      if (selector === "img") return node.tagName === "IMG";
      if (selector.startsWith(".")) return node.classList.contains(selector.slice(1));
      return false;
    };
    const visit = (node) => {
      for (const child of node.children) {
        if (matches(child)) return child;
        const nested = visit(child);
        if (nested) return nested;
      }
      return null;
    };
    return visit(this);
  }

  closest(selector) {
    if (selector === ".grid-item" && this.classList.contains("grid-item")) return this;
    return this.parentNode?.closest(selector) ?? null;
  }
}

function loadRendererFactory(document) {
  const source = fs.readFileSync(new URL("../spatial/dom-renderer.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const dependencies = {
    "@/lib/bookmark-utils": {
      cleanPostText: (value) => value,
      lineClampText: (value) => value,
      twitterImageUrl: (url, size) => `${url}?size=${size}`,
    },
    "@/lib/perf": { kairosPerf: { begin() {}, end() {}, count() {} } },
    "@/lib/spatial/spatial-engine": {
      DOM_WRITE_EPS: 0.01,
      imageRank: { small: 0, medium: 1, large: 2 },
    },
    "@/lib/image-load-guard.mjs": {
      beginImageAssignment,
      invalidateImageAssignment,
      isCurrentImageAssignment,
    },
  };
  const module = { exports: {} };
  const localRequire = (name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected renderer dependency: ${name}`);
    return dependencies[name];
  };
  new Function("require", "module", "exports", "document", "Event", outputText)(
    localRequire,
    module,
    module.exports,
    document,
    Event
  );
  return module.exports.createDomRenderer;
}

function renderBookmark(url) {
  const original = { id: "bookmark-1", text: "post", images: [{ url, width: 1200, height: 800 }] };
  return {
    id: original.id,
    text: original.text,
    images: original.images,
    bookmark: original,
  };
}

test("active pooled card adopts refreshed same-ID bookmark and rejects the old request callbacks", () => {
  const document = {
    createElement: (tag) => new FakeElement(tag),
    createDocumentFragment: () => {
      const fragment = new FakeElement("#fragment");
      fragment.tagName = "#FRAGMENT";
      return fragment;
    },
  };
  const world = new FakeElement("div");
  const createDomRenderer = loadRendererFactory(document);
  const renderer = createDomRenderer(world, 1, 8, { rich: true, view: "media" });
  renderer.createPool();

  const visible = [{ bookmarkId: "bookmark-1", x: 0, y: 0, w: 200, h: 140, bucket: "medium" }];
  const visibleIds = new Set(["bookmark-1"]);
  const firstBookmark = renderBookmark("https://images.test/old.jpg");
  renderer.render(visible, visibleIds, new Map([[firstBookmark.id, firstBookmark]]));

  const pooledElement = world.children[0];
  const image = pooledElement.querySelector("img");
  const oldLoad = image.onload;
  const oldError = image.onerror;
  assert.equal(renderer.activeMapSize(), 1, "the pooled card remains active across reload");
  assert.equal(image.src, "https://images.test/old.jpg?size=medium");

  // This is the data-reload boundary used by useSpatialFeed: it installs a new
  // bookmark map and passes that map through the normal renderer.render API.
  // No renderer-private ownership map is changed by the fixture.
  const refreshedBookmark = renderBookmark("https://images.test/new.jpg");
  const refreshedMap = new Map([[refreshedBookmark.id, refreshedBookmark]]);
  renderer.render(visible, visibleIds, refreshedMap);

  assert.equal(renderer.activeMapSize(), 1);
  assert.equal(renderer.bookmarkForElement(pooledElement), refreshedBookmark);
  assert.equal(image.src, "https://images.test/new.jpg?size=medium");

  const newLoad = image.onload;
  const newError = image.onerror;
  oldLoad(new Event("load"));
  oldError(new Event("error"));
  assert.equal(image.src, "https://images.test/new.jpg?size=medium");
  assert.equal(pooledElement.querySelector(".grid-item-media").classList.contains("loading-image"), true);

  image.complete = true;
  image.naturalWidth = 1200;
  newLoad(new Event("load"));
  assert.equal(pooledElement.querySelector(".grid-item-media").classList.contains("loading-image"), false);
  assert.equal(image.onerror, newError);
  renderer.destroy();
});

test("a loaded old-source cache entry cannot be reused for a refreshed bookmark", () => {
  const document = {
    createElement: (tag) => new FakeElement(tag),
    createDocumentFragment: () => {
      const fragment = new FakeElement("#fragment");
      fragment.tagName = "#FRAGMENT";
      return fragment;
    },
  };
  const world = new FakeElement("div");
  const renderer = loadRendererFactory(document)(world, 1, 8, { rich: true, view: "media" });
  renderer.createPool();
  const visible = [{ bookmarkId: "bookmark-1", x: 0, y: 0, w: 200, h: 140, bucket: "medium" }];
  const visibleIds = new Set(["bookmark-1"]);
  const previous = renderBookmark("https://images.test/cached-old.jpg");
  renderer.render(visible, visibleIds, new Map([[previous.id, previous]]));

  const image = world.children[0].querySelector("img");
  image.complete = true;
  image.naturalWidth = 1200;
  image.onload(new Event("load"));

  const refreshed = renderBookmark("https://images.test/refreshed.jpg");
  renderer.render(visible, visibleIds, new Map([[refreshed.id, refreshed]]));

  assert.equal(renderer.bookmarkForElement(world.children[0]), refreshed);
  assert.equal(image.src, "https://images.test/refreshed.jpg?size=medium");
  renderer.destroy();
});
