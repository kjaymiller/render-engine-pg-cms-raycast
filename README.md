# pg-cms Microblog (Raycast)

Grab the frontmost browser's active tab and open the
[render-engine-pg-cms](https://cms.kjaymiller.dev) microblog composer with it
prefilled. **It opens the composer page — it never publishes on your behalf.**

## Commands

**Quick Microblog Post** — a Raycast form with Content, External Link,
External Image, and Slug fields. Submitting opens `/c/<content-type>/new`
prefilled so you review and hit publish on the page. **It does not publish
from Raycast.**

**Microblog Current Tab** — reads the active browser tab and opens
`/c/<content-type>/new` with query params filled in:

| Composer field  | Source                                                        |
| --------------- | ------------------------------------------------------------- |
| `external_link` | the active tab URL                                            |
| `slug`          | derived server-side from the link host                        |
| `content`       | optional note argument, or the page title (if enabled)        |
| `image_url`     | the page's share image (if enabled — see below)               |

You land on the CMS page to finish writing and hit save yourself. The composer
opens in the browser the tab was read from (falling back to your default
browser when that can't be determined).

If the tab can't be read at all, the composer still opens (empty) so you can
paste the link — the command never silently does nothing.

### Optional argument

Type a quick note when launching the command — it becomes the starting
`content` of the post.

## Supported browsers

The command reads the active tab three ways, in order:

1. **Raycast Browser Extension** — if installed, this reads the active tab
   natively for every browser it supports (including Firefox and Zen) with no
   AppleScript and no clipboard side effects. Recommended.
2. **AppleScript** — for WebKit (Safari, Orion) and Chromium-family browsers
   (Chrome, Brave, Edge, Arc, Vivaldi, Chromium, Opera, Dia). macOS prompts
   Raycast for Automation (Apple Events) access the first time — allow it.
3. **Keystroke fallback (Firefox / Zen)** — Firefox and its forks expose no
   scriptable tab, so the URL is grabbed by focusing the address bar (⌘L) and
   copying (⌘C). This **requires Accessibility permission** for Raycast
   (System Settings → Privacy & Security → Accessibility) and **overwrites the
   clipboard** with the copied URL. Installing the Browser Extension avoids
   this entirely.

By default the command uses whichever browser is frontmost; set **Default
Browser** to always read from a specific one, even when it isn't frontmost.

## Preferences

- **CMS Base URL** — default `https://cms.kjaymiller.dev`
- **Content Type** — default `microblog` (the `{name}` in `/c/{name}/new`)
- **External Image** — fetch the page and prefill `image_url` from its share
  image. Scans, in order: `og:image` / `og:image:url` (as `property=` or
  `name=`), `twitter:image` / `twitter:image:src`, `itemprop="image"`, and
  `<link rel="image_src">`; relative URLs are resolved against the page.
- **Seed Content** — use the page title as content when no note is given
- **Default Browser** — which browser's active tab to read. _Automatic_ uses
  the Browser Extension, then the frontmost browser; pick a specific browser to
  always read from it.

## Develop

```sh
npm install
npm run dev   # runs `ray develop`; needs the Raycast app installed
```

## Server support

The prefill params are read by the `new_form` handler
(`GET /c/{name}/new`) in render-engine-pg-cms: `external_link` (with `url` as a
legacy alias), `title`, `content`, `image_url`, and `slug`. Each is applied
only when the content type actually has that column, so a param the type
doesn't use is simply ignored.
