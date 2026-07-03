import {
  BrowserExtension,
  environment,
  getFrontmostApplication,
  getPreferenceValues,
  LaunchProps,
  open,
  showHUD,
} from "@raycast/api";
import { runAppleScript } from "@raycast/utils";

interface Preferences {
  cmsBase: string;
  contentType: string;
  fetchImage: boolean;
  seedContentWithTitle: boolean;
  defaultBrowser: string;
}

interface Arguments {
  content?: string;
}

// WebKit-based browsers expose `front document`; Chromium-based ones expose
// `active tab of front window`. Names must match the app's process name.
const WEBKIT = new Set([
  "Safari",
  "Safari Technology Preview",
  "Orion",
  "Orion RC",
]);
const CHROMIUM = new Set([
  "Google Chrome",
  "Google Chrome Canary",
  "Google Chrome Beta",
  "Google Chrome Dev",
  "Brave Browser",
  "Brave Browser Beta",
  "Brave Browser Nightly",
  "Microsoft Edge",
  "Microsoft Edge Beta",
  "Microsoft Edge Dev",
  "Microsoft Edge Canary",
  "Vivaldi",
  "Chromium",
  "Arc",
  "Dia",
  "Opera",
  "Opera GX",
]);
// Firefox and its forks ship no AppleScript tab dictionary, so we can't ask for
// the URL directly — see readFirefoxTab for the keystroke workaround.
const FIREFOX = new Set([
  "Firefox",
  "Firefox Developer Edition",
  "Firefox Nightly",
  "Zen",
  "Zen Browser",
  "zen", // frontmost process name in Auto mode
]);

// A browser's scriptable AppleScript name can differ from the dropdown label and
// from the frontmost process name. Zen is picked as "Zen Browser" and reports
// frontmost as "zen", but AppleScript can only resolve it as "zen".
const SCRIPTABLE_NAME: Record<string, string> = {
  "Zen Browser": "zen",
  Zen: "zen",
};
const asScriptable = (appName: string) => SCRIPTABLE_NAME[appName] ?? appName;

async function readActiveTab(
  appName: string,
): Promise<{ url: string; title: string }> {
  if (FIREFOX.has(appName)) {
    return readFirefoxTab(appName);
  }

  const app = asScriptable(appName);
  let script: string;
  if (WEBKIT.has(appName)) {
    script = `tell application "${app}"
      set theDoc to front document
      return (URL of theDoc) & linefeed & (name of theDoc)
    end tell`;
  } else if (CHROMIUM.has(appName)) {
    script = `tell application "${app}"
      set theTab to active tab of front window
      return (URL of theTab) & linefeed & (title of theTab)
    end tell`;
  } else {
    throw new Error(`${appName} is not a supported browser`);
  }

  const out = await runAppleScript(script);
  const [url = "", title = ""] = out.split("\n");
  return { url: url.trim(), title: title.trim() };
}

// Firefox exposes no scriptable "active tab", so we grab the URL the only way
// available: focus the address bar (Cmd+L), copy (Cmd+C), and read the
// clipboard. This overwrites the clipboard and requires Accessibility
// permission for Raycast (System Settings → Privacy → Accessibility). No title
// is available this way.
async function readFirefoxTab(
  appName: string,
): Promise<{ url: string; title: string }> {
  const script = `tell application "${asScriptable(appName)}" to activate
delay 0.3
tell application "System Events"
  keystroke "l" using command down
  delay 0.15
  keystroke "c" using command down
  delay 0.15
end tell
delay 0.1
return (the clipboard as text)`;

  const out = (await runAppleScript(script)).trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(out)) {
    throw new Error(
      `Couldn't read ${appName}'s URL — grant Raycast Accessibility permission and try again`,
    );
  }
  return { url: out, title: "" };
}

// Preferred path: the Raycast Browser Extension reads the active tab natively
// for every browser it supports — including Firefox and Zen — with no
// AppleScript and no clipboard side effects. Only available when the user has
// installed the extension in their browser; returns null otherwise.
async function tabFromBrowserExtension(): Promise<{
  url: string;
  title: string;
} | null> {
  if (!environment.canAccess(BrowserExtension)) return null;
  try {
    const tabs = await BrowserExtension.getTabs();
    const active = tabs.find((t) => t.active) ?? tabs[0];
    if (active?.url) return { url: active.url, title: active.title ?? "" };
  } catch {
    // fall through to the AppleScript path
  }
  return null;
}

// Best-effort: fetch the page and pull og:image / twitter:image so the
// microblog's external image comes prefilled. Never blocks the flow — any
// failure just means no image param.
async function fetchOgImage(pageUrl: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(pageUrl, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (Macintosh) RaycastMicroblog" },
    });
    clearTimeout(timer);
    if (!res.ok) return "";

    const head = (await res.text()).slice(0, 200_000);
    // Try, in priority order, the common ways pages expose a share image.
    // `property=` and `name=` are both accepted (sites use either), and
    // content can appear before or after the identifying attribute.
    const patterns = [
      /<meta[^>]+(?:property|name)=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image(?::url)?["']/i,
      /<meta[^>]+(?:property|name)=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']twitter:image(?::src)?["']/i,
      /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i,
      /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    ];
    for (const re of patterns) {
      const m = head.match(re);
      if (m) return new URL(m[1], pageUrl).toString();
    }
    return "";
  } catch {
    return "";
  }
}

export default async function Command(
  props: LaunchProps<{ arguments: Arguments }>,
) {
  const prefs = getPreferenceValues<Preferences>();
  const base = (prefs.cmsBase || "https://cms.kjaymiller.dev").replace(
    /\/+$/,
    "",
  );
  const type = (prefs.contentType || "microblog").trim();

  const preferredBrowser = (prefs.defaultBrowser || "auto").trim();

  let tab: { url: string; title: string } | null = null;
  let readError = "";
  // The browser the tab was read from — we reopen the composer here so it lands
  // in the same browser rather than the macOS default. Undefined when unknown
  // (e.g. the Browser Extension path), which falls back to the system default.
  let sourceApp: string | undefined;

  // Prefer the Raycast Browser Extension in every mode: it reads the active tab
  // natively for all supported browsers (incl. Firefox/Zen) with no AppleScript
  // and no clipboard side effects. It's only unavailable when the extension
  // isn't installed in the browser — in which case we fall back to AppleScript.
  tab = await tabFromBrowserExtension();

  if (!tab) {
    if (preferredBrowser && preferredBrowser !== "auto") {
      // A specific browser is pinned in preferences — read straight from it via
      // AppleScript so it works even when that browser isn't frontmost.
      try {
        const read = await readActiveTab(preferredBrowser);
        if (read.url && read.url !== "missing value") {
          tab = read;
          sourceApp = preferredBrowser;
        } else {
          readError = `No active tab URL in ${preferredBrowser}`;
        }
      } catch (err) {
        readError = err instanceof Error ? err.message : String(err);
      }
    } else {
      // Automatic: AppleScript against the frontmost browser.
      try {
        const appName = (await getFrontmostApplication()).name;
        const read = await readActiveTab(appName);
        if (read.url && read.url !== "missing value") {
          tab = read;
          sourceApp = appName;
        } else {
          readError = `No active tab URL in ${appName}`;
        }
      } catch (err) {
        readError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  // The composer (/c/{name}/new) reads `external_link` for the tab's URL —
  // `url` is only a legacy alias, so we send the canonical field.
  const params = new URLSearchParams();
  if (tab?.url) params.set("external_link", tab.url);

  const note = props.arguments.content?.trim();
  const content =
    note || (prefs.seedContentWithTitle && tab?.title ? tab.title : "");
  if (content) params.set("content", content);

  if (prefs.fetchImage && tab?.url) {
    const image = await fetchOgImage(tab.url);
    if (image) params.set("image_url", image);
  }

  const query = params.toString();
  const target = `${base}/c/${encodeURIComponent(type)}/new${query ? `?${query}` : ""}`;
  await open(target, sourceApp);

  if (!tab?.url) {
    await showHUD(
      `✍️ Opened ${type} composer — ${readError || "couldn't read the tab"}; paste the link`,
    );
    return;
  }

  let host = tab.url;
  try {
    host = new URL(tab.url).hostname;
  } catch {
    // keep the raw url in the HUD if it doesn't parse
  }
  await showHUD(`✍️ Composing ${type} for ${host}`);
}
