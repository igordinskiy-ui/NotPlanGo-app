import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const fail = (message) => failures.push(message);
const assert = (condition, message) => {
  if (!condition) fail(message);
};

function readJson(relativePath) {
  try {
    return JSON.parse(readText(relativePath));
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error.message}`);
    return {};
  }
}

const manifest = readJson("public/manifest.webmanifest");
assert(manifest.name === "NotPlanGo", "manifest name must be NotPlanGo");
assert(manifest.short_name === "NotPlanGo", "manifest short_name must be NotPlanGo");
assert(manifest.start_url === "/", "manifest start_url must be /");
assert(manifest.scope === "/", "manifest scope must be /");
assert(manifest.display === "standalone", "manifest display must be standalone");
assert(manifest.orientation === "portrait", "manifest orientation must be portrait");
assert(Array.isArray(manifest.icons), "manifest icons must be an array");
assert(Array.isArray(manifest.screenshots), "manifest screenshots must be an array");

const icons = manifest.icons ?? [];
const hasIcon = (sizes, purpose, type = "image/png") => icons.some((icon) => icon.sizes === sizes && icon.purpose === purpose && icon.type === type);
assert(hasIcon("192x192", "any"), "manifest must include 192x192 PNG icon");
assert(hasIcon("512x512", "any"), "manifest must include 512x512 PNG icon");
assert(hasIcon("512x512", "maskable"), "manifest must include maskable 512x512 PNG icon");

for (const icon of icons) {
  if (typeof icon.src === "string" && icon.src.startsWith("/")) {
    assert(exists(`public${icon.src}`), `manifest icon file missing: public${icon.src}`);
  }
}

for (const screenshot of manifest.screenshots ?? []) {
  if (typeof screenshot.src === "string" && screenshot.src.startsWith("/")) {
    assert(exists(`public${screenshot.src}`), `manifest screenshot file missing: public${screenshot.src}`);
  }
}

for (const requiredFile of [
  "public/apple-touch-icon.png",
  "public/icon-192.png",
  "public/icon-512.png",
  "public/maskable-icon-512.png",
  "public/sw.js",
  "vercel.json",
  "netlify.toml",
]) {
  assert(exists(requiredFile), `${requiredFile} is missing`);
}

const sw = readText("public/sw.js");
for (const appShellFile of [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/maskable-icon-512.png",
  "/apple-touch-icon.png",
]) {
  assert(sw.includes(`"${appShellFile}"`), `service worker app shell missing ${appShellFile}`);
}
assert(sw.includes('self.addEventListener("install"'), "service worker install handler missing");
assert(sw.includes('self.addEventListener("activate"'), "service worker activate handler missing");
assert(sw.includes('self.addEventListener("fetch"'), "service worker fetch handler missing");
assert(sw.includes("caches.match(\"/index.html\")"), "service worker offline navigation fallback missing");
assert(sw.includes('self.addEventListener("notificationclick"'), "service worker notificationclick handler missing");
assert(sw.includes('event.action === "snooze"'), "service worker notification snooze action missing");
assert(sw.includes("action=snooze-reminders"), "service worker notification snooze deep link missing");
assert(sw.includes("parsedTargetUrl.origin === self.location.origin"), "service worker notification click must guard same-origin targets");
assert(sw.includes("client.navigate(targetUrl)"), "service worker notification click must navigate existing clients");
assert(sw.includes("self.clients.openWindow(targetUrl)"), "service worker notification click must open the PWA when no client exists");

const vercel = readJson("vercel.json");
const vercelHeaderText = JSON.stringify(vercel.headers ?? []);
for (const header of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Cache-Control"]) {
  assert(vercelHeaderText.includes(header), `vercel.json missing ${header}`);
}
assert(vercelHeaderText.includes("no-cache, no-store, must-revalidate"), "vercel.json must no-cache /sw.js");

const netlify = readText("netlify.toml");
for (const expected of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Cache-Control", "no-cache, no-store, must-revalidate"]) {
  assert(netlify.includes(expected), `netlify.toml missing ${expected}`);
}

if (failures.length) {
  console.error("PWA verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PWA verification passed");
