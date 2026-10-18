/* RL — faz o app abrir sem internet.
   Arquivos do app (e os preços da ANP): tenta a rede primeiro, para pegar a versão nova, e usa a cópia guardada se estiver sem sinal.
   Fontes e biblioteca de PDF (de fora): usa a cópia guardada e atualiza por trás.
   Tabela FIPE, Sentry e Google Drive não passam por aqui: só funcionam com internet. */
const VERSAO = "cm-__VERSAO__";
const APP = ["./", "./index.html", "./local.js", "./drive.js", "./config.js", "./qrcode.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO && k !== "cm-externos").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const comPrazo = (p, ms) => new Promise((ok, falha) => { const t = setTimeout(() => falha(new Error("prazo")), ms); p.then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); falha(e); }); });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSAO);
      const chave = req.mode === "navigate" ? "./index.html" : req;
      try {
        const r = await comPrazo(fetch(req), 4000);
        if (r && r.ok) cache.put(chave, r.clone());
        return r;
      } catch (err) {
        const guardada = await cache.match(chave, { ignoreSearch: true });
        if (guardada) return guardada;
        throw err;
      }
    })());
    return;
  }
  if (/fonts\.(googleapis|gstatic)\.com$|cdnjs\.cloudflare\.com$/.test(url.hostname)) {
    e.respondWith((async () => {
      const cache = await caches.open("cm-externos");
      const guardada = await cache.match(req);
      const rede = fetch(req).then((r) => { if (r && (r.ok || r.type === "opaque")) cache.put(req, r.clone()); return r; }).catch(() => null);
      return guardada || (await rede) || Response.error();
    })());
  }
});
