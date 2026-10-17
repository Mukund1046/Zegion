# Image-loading benchmark procedure

This procedure measures the original feed and spatial feed independently. It
does not presume that browser scheduling is the cause of a difference and does
not authorize a scheduler or other image-pipeline change by itself.

## Test matrix

Start with Chrome and Firefox. Test each feed in a separate run, then repeat the
same matrix for each other installed browser. Record the exact browser name,
version, engine version when available, OS/build, application commit, and date.
Use clean browser profiles with extensions disabled. Keep viewport dimensions,
device-pixel ratio, zoom, power mode, and foreground/background state fixed.

Use one frozen bookmark dataset and ordering for every run. Record its source,
bookmark count, image-bearing bookmark count, dataset revision/hash, and the
feed filters/sort used. Keep the API response and image URLs identical between
browsers. Do not compare the feeds using a combined score.

Use a fixed network profile for all browsers (record downlink, uplink, RTT, and
packet loss). Prefer an equivalent profile configured in each browser's network
tools; if equivalent throttling cannot be established, label results as
uncontrolled instead of treating them as a parity comparison. Keep the server,
machine, and network path unchanged. Do not run competing downloads during a
measurement.

## Run procedure

For each browser × feed × cache state:

1. Open a fresh page at the same viewport and navigate to the chosen feed with
   the same dataset and filters. Do not change zoom, scroll position, or sort
   between repetitions.
2. Capture a browser Performance trace and Network log/HAR from navigation
   start through image settling. Preserve image requests, response status,
   resource timing, transferred/encoded byte counts, and cache indicators.
3. Repeat at least five times. Report each run and median/p75; do not omit a
   failed or slow run without recording the reason.
4. Run cold-cache tests after clearing the browser HTTP cache (without clearing
   application data). Run warm-cache tests by completing one identical load,
   retaining the browser cache, then reloading the same feed and dataset.
   Record whether responses came from memory cache, disk cache, or network.
5. Repeat the full procedure separately for the other feed. Do not keep one
   feed mounted behind the other or combine their request totals.

Define the measured endpoints consistently:

- **First usable image:** first visible target image whose decoded dimensions
  are nonzero and whose pixels have been presented. Record both the image
  `load`/decode-ready event and the first frame where it is visibly painted;
  use the latter as the primary user-perceived time.
- **Final image quality:** time until every image in the fixed visible target
  set has reached the feed's final existing image-size bucket and decoded. Do
  not count offscreen images as targets. Record target-set size and any item
  that cannot reach final quality.
- **Requests/bytes:** image request count and transferred bytes, including
  cached responses separately. Exclude API/font/script requests from image
  totals but retain the complete HAR/trace.
- **Duplicates:** same canonical image URL requested more than once during a
  run; report total duplicate requests and URL/request IDs. Distinguish browser
  cache revalidation from a second full transfer.
- **Failures:** failed image requests, HTTP errors, decode errors, and images
  that never become usable, categorized separately.

## Extended browsing/resource run

For each feed, run the same recorded browsing sequence for ten minutes: initial
viewport, repeated viewport-sized scroll/pan increments through a fixed set of
items, a fixed set of zoom levels for the spatial feed, and rapid navigation
through the same bookmark range. Record the sequence and duration so it can be
replayed. Keep the page foregrounded and use the same cadence in every browser.

Capture baseline and end-of-run process memory and browser heap/DOM information
using each browser's available developer tools. Also record image element count,
in-flight/failed requests when available, and whether memory returns toward
baseline after navigating back to the starting region. Browser memory metrics
are not directly comparable across engines; compare before/after within each
browser and feed, and report the collection method with each number.

## Collection and limitations

Browser DevTools Network logs/HAR and Performance traces can provide request
timing, status, cache behavior, and byte counts. Performance traces can show
image decode and paint activity. The `load`/decode-ready to visible-paint
distinction may require correlating a trace with screenshots or an explicitly
instrumented test harness; do not substitute `load` time for perceived paint
without labeling it. Memory collection is browser-specific and may require a
manual heap/process snapshot. No values should be inferred from automated unit
tests or source inspection.

For each run, store the raw HAR/trace and a summary row with:

| Browser/version | Feed | Cache | Network profile | Run | First usable (ms) | Final quality (ms) | Image requests | Transferred bytes | Duplicates | Failures | Start/end memory | Notes |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |

Report Chrome and Firefox separately for each feed. Any Chrome-relative target
is an investigation threshold, not permission to trade away correctness. Only
after the baseline is complete should concurrency candidates (2, 4, and 8) be
tested under the same protocol. Preserve baseline artifacts so the comparison
is reproducible.

## Spatial bookmark-ownership investigation

`useSpatialFeed.reloadData` replaces `bookmarkMapRef.current` with newly
converted bookmark objects. The renderer instance and its `activeMap` survive
that reload. `createDomRenderer` updates its `bookmarks` lookup on every render,
but records `elToBookmark` only when an element is first mounted and deletes it
on eviction. Existing active entries are not rebound when a new bookmark map is
installed. The image callback compares the captured bookmark object by identity
with that mount-time `elToBookmark` entry.

This lifecycle means object replacement while a card remains active is
possible; it does not alone prove an incorrect image. A visible failure needs
the same bookmark ID to receive materially changed image data/source while the
old element remains active and its old request is still pending (or its old
image remains assigned). Confirm that case with a controlled fixture or trace
before proposing a fix. Do not change pool reuse, ownership maps, or renderer
semantics as part of benchmark setup.
