# pg-cms Microblog (Raycast)

Grab the frontmost browser's active tab and open the
[render-engine-pg-cms](https://cms.kjaymiller.dev) microblog composer with it
prefilled. **It opens the composer page — it never publishes on your behalf.**

## Commands

**Quick Microblog Post** — a Raycast form with Content, External Link,
External Image, and Slug fields. Submitting opens `/c/<content-type>/new`
prefilled so you review and hit publish on the page. **It does not publish
from Raycast.**

**Microblog Current Tab** — reads the active tab of the frontmost browser
window and opens `/c/<content-type>/new` with query params filled in:

| Composer field  | Source                                                        |
| --------------- | ------------------------------------------------------------- |
| `external_link` | the active tab URL (sent as `url`)                            |
| `slug`          | derived server-side from the link host                        |
| `content`       | optional note argument, or the page title (if enabled)        |
| `image_url`     | the page's `og:image` / `twitter:image` (if enabled)          |

You land on the CMS page to finish writing and hit save yourself.

### Optional argument

Type a quick note when launching the command — it becomes the starting
`content` of the post.

## Supported browsers

Safari, Orion (WebKit) and Chromium-family browsers: Chrome, Brave, Edge, Arc,
Vivaldi, Chromium, Opera, Dia. The command uses whichever browser is frontmost.

macOS will prompt Raycast for Automation (Apple Events) access to the browser
the first time you run it — allow it.

## Preferences

- **CMS Base URL** — default `https://cms.kjaymiller.dev`
- **Content Type** — default `microblog` (the `{name}` in `/c/{name}/new`)
- **External Image** — fetch the page and prefill `image_url` from og:image
- **Seed Content** — use the page title as content when no note is given

## Develop

```sh
npm install
npm run dev   # runs `ray develop`; needs the Raycast app installed
```

## Server support

The `content`, `image_url` and explicit `slug` query params require the
`new_form` handler in render-engine-pg-cms to read them (branch
`microblog-url-params`). Without that patch the composer still opens with the
link/slug prefilled via the existing `url` param — the extra params are simply
ignored.
