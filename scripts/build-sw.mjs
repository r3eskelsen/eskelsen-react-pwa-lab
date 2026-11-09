import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const assets = (await readdir("dist/assets")).sort();
const paths = ["index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", ...assets.map(name => `assets/${name}`)];
const hash = createHash("sha256");
for (const path of paths) {
  hash.update(path);
  hash.update(await readFile(`dist/${path}`));
}
const version = hash.digest("hex").slice(0, 16);
const urls = paths.map(path => `/${path}`);
const worker = `
const CACHE = "eskelsen-fieldnote-shell-${version}";
const PREFIX = "eskelsen-fieldnote-shell-";
const FILES = ${JSON.stringify(urls)};
const ALLOWED = new Set(FILES);

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map(url => new Request(url, { cache: "reload" })));
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(PREFIX) && name !== CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  const shellNavigation = request.mode === "navigate" &&
    (url.pathname === "/" || url.pathname === "/index.html");

  if (!shellNavigation && (!ALLOWED.has(url.pathname) || url.search)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const response = await cache.match(shellNavigation ? "/index.html" : url.pathname);
    return response || fetch(request);
  })());
});
`;
await writeFile("dist/sw.js", worker);
console.log(`SERVICE_WORKER_GENERATED=${version}`);
console.log(`PRECACHE_FILE_COUNT=${urls.length}`);