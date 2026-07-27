const CACHE_NAME = "wenlian-v6";
const BASE_URL = new URL("./", self.location.href);
const APP_ASSETS = [
  "./",
  "manifest.webmanifest",
  "app-config.js",
  "icon-512.png",
  "apple-touch-icon.png",
  "data/exercises.zh.json",
  "gifs/0043-qXTaZnJ.gif",
  "gifs/0025-EIeI8Vf.gif",
  "gifs/0861-fUBheHs.gif",
  "gifs/0334-DsgkuIt.gif",
  "gifs/0175-WW95auq.gif",
  "gifs/1372-8ozhUIZ.gif",
  "gifs/0085-wQ2c4XD.gif",
  "gifs/2330-LEprlgG.gif",
  "gifs/0405-znQUdHY.gif",
  "gifs/0381-SSsBDwB.gif",
  "gifs/0031-25GPyDY.gif",
  "gifs/0241-gAwDzB3.gif",
  "gifs/0739-10Z2DXU.gif",
  "gifs/0314-ns0SIbU.gif",
  "gifs/0180-hvV79Si.gif",
  "gifs/0586-17lJ1kr.gif",
  "gifs/0380-v1qBec9.gif",
  "gifs/1391-ykHcWme.gif",
  "gifs/0630-RJgzwny.gif",
  "gifs/0276-iny3m5y.gif",
  "gifs/0872-nCU1Ekp.gif",
  "gifs/1685-QChZi3x.gif",
  "gifs/3699-yRpV5TC.gif",
].map((path) => new URL(path, BASE_URL).toString());

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok && new URL(event.request.url).origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
