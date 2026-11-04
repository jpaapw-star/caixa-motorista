/* RLCAR — leitor de fotos (print, cupom, painel) pelo Gemini grátis.
   O app manda {prompt, fotos: [JPEG em base64]} e recebe {resposta: objeto JSON} ou {erro: código}.
   A chave do Gemini fica só aqui no script do Google (arquivo Chave.gs, gerado pelo robô na publicação).
   Nunca vai para o celular nem para o repositório. */
const MODELOS = ["gemini-flash-lite-latest", "gemini-flash-latest"];
const MAX_FOTOS = 3, MAX_BYTES = 4 * 1024 * 1024;

function doPost(e) {
  try {
    const pedido = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const prompt = String(pedido.prompt || "").slice(0, 8000), fotos = Array.isArray(pedido.fotos) ? pedido.fotos.slice(0, MAX_FOTOS) : [];
    if (!prompt || !fotos.length || fotos.some((f) => typeof f !== "string" || f.length > MAX_BYTES)) return saida({ erro: "image_rejected" });
    // limite por minuto para ninguém gastar a cota grátis inteira com o endereço do script
    const cache = CacheService.getScriptCache(), k = "min:" + Math.floor(Date.now() / 60000), n = Number(cache.get(k) || 0);
    if (n >= 12) return saida({ erro: "rate_limited" });
    cache.put(k, String(n + 1), 120);
    // Chave.gs é gerado pelo robô na publicação (segredo GEMINI_CHAVE do GitHub) e só existe aqui no Google
    const chave = typeof GEMINI_CHAVE !== "undefined" ? GEMINI_CHAVE : PropertiesService.getScriptProperties().getProperty("GEMINI_CHAVE");
    if (!chave) return saida({ erro: "capability_disabled" });
    const corpo = JSON.stringify({ contents: [{ parts: [{ text: prompt }].concat(fotos.map((d) => ({ inline_data: { mime_type: "image/jpeg", data: d } }))) }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 } });
    let ultimo = "ia";
    for (const m of MODELOS) {
      const r = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models/" + m + ":generateContent", {
        method: "post", contentType: "application/json", payload: corpo, muteHttpExceptions: true, headers: { "x-goog-api-key": chave } });
      const st = r.getResponseCode();
      if (st === 429) { ultimo = "rate_limited"; continue; }
      if (st >= 500 || st === 404) { ultimo = "ia"; continue; } // modelo ocupado: tenta o outro
      if (st === 400) return saida({ erro: "image_rejected" });
      if (st !== 200) return saida({ erro: "ia" });
      const j = JSON.parse(r.getContentText()), c = j.candidates && j.candidates[0], partes = (c && c.content && c.content.parts) || [];
      const texto = partes.map((p) => p.text || "").join("").replace(/^```(json)?|```$/g, "").trim();
      try { return saida({ resposta: JSON.parse(texto) }); } catch (err) { return saida({ erro: "ia" }); }
    }
    return saida({ erro: ultimo });
  } catch (err) {
    return saida({ erro: "ia" });
  }
}
function doGet() { return saida({ ok: true, servico: "leitor do RLCAR" }); }
function saida(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

