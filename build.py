"""Monta o app publicado (pasta dist/) a partir de app.html.

Uso: python build.py
O robô do GitHub roda isto antes dos testes e publica a pasta dist/ no GitHub Pages.
"""
import hashlib
import json
import os
import re
import shutil

AQUI = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(AQUI, "dist")


def ler(nome):
    with open(os.path.join(AQUI, nome), encoding="utf-8") as f:
        return f.read()


src = ler("app.html")
local_js, config_js, sw_modelo, qr_js, drive_js = ler("local.js"), ler("config.js"), ler("sw.template.js"), ler("qrcode.js"), ler("drive.js")
versao = hashlib.sha1((src + local_js + config_js + sw_modelo + qr_js + drive_js).encode()).hexdigest()[:10]

# separa o cabeçalho (título, fontes, estilos) do corpo (telas e script)
corte = src.index("</style>") + len("</style>")
cab, corpo = src[:corte], src[corte:]
cab = re.sub(r'<meta name="claude:[^>]*>\n?', "", cab)
assert corpo.count("<script>\n(() => {") == 1, "não achei o começo do script do app em app.html"

# Sentry: só liga quando config.js tem o DSN. Manda os erros do app, nunca os dados digitados.
sentry = """<script src="config.js"></script>
<script>
(function () {
  var c = window.CAIXA_CONFIG || {};
  var m = /^https:\\/\\/([0-9a-f]+)@/i.exec(String(c.sentryDsn || "").trim());
  if (!m) return;
  var teste = location.hostname === "127.0.0.1" || location.hostname === "localhost";
  window.sentryOnLoad = function () {
    Sentry.init({ release: "caixa-motorista@%s", environment: teste ? "teste" : "producao", sendDefaultPii: false });
  };
  var s = document.createElement("script");
  s.src = "https://js.sentry-cdn.com/" + m[1] + ".min.js";
  s.crossOrigin = "anonymous";
  document.head.appendChild(s);
})();
</script>
""" % versao

corpo = corpo.replace("<script>\n(() => {", sentry + '<script src="local.js"></script>\n<script src="drive.js"></script>\n<script>\n(() => {', 1)
corpo = corpo.rstrip() + """
<script>
  if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
</script>
"""

index = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Ganhos, gastos, combustível e manutenção do carro para motoristas de aplicativo.">
<meta name="theme-color" content="#EDF0EC" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0E1311" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Caixa Motorista">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
{cab}
</head>
<body>
{corpo}
</body>
</html>
"""

manifest = {
    "name": "Caixa do Motorista",
    "short_name": "Caixa Motorista",
    "description": "Ganhos, gastos, combustível e manutenção do carro para motoristas de aplicativo.",
    "lang": "pt-BR",
    "id": "./",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": "#EDF0EC",
    "theme_color": "#EDF0EC",
    "icons": [
        {"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}

if os.path.isdir(DIST):
    shutil.rmtree(DIST)
os.makedirs(DIST)


def escrever(nome, texto):
    with open(os.path.join(DIST, nome), "w", encoding="utf-8") as f:
        f.write(texto)


escrever("index.html", index)
escrever("manifest.webmanifest", json.dumps(manifest, ensure_ascii=False, indent=2))
escrever("sw.js", sw_modelo.replace("__VERSAO__", versao))
for nome in ["local.js", "drive.js", "config.js", "qrcode.js", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"]:
    shutil.copy(os.path.join(AQUI, nome), os.path.join(DIST, nome))

# preços da ANP (o robô grava em dados/anp.json); sem eles, o app só esconde a comparação
anp = os.path.join(AQUI, "dados", "anp.json")
if os.path.exists(anp):
    os.makedirs(os.path.join(DIST, "dados"))
    shutil.copy(anp, os.path.join(DIST, "dados", "anp.json"))

print("app montado em dist/ (versão %s)%s" % (versao, "" if os.path.exists(anp) else " sem preços da ANP ainda"))
