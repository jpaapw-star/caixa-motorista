/* Caixa do Motorista — dados guardados no próprio aparelho.
   Imita a pequena parte do banco de dados que o app usa (doc, collection, onSnapshot, add, set, delete)
   e guarda tudo no armazenamento do navegador. Nada sai do celular. */
(() => {
  const KEY = "caixa-motorista:dados:v1";
  let store = null;
  try {
    store = JSON.parse(localStorage.getItem(KEY) || "{}");
    localStorage.setItem(KEY + ":teste", "1");
    localStorage.removeItem(KEY + ":teste");
  } catch (e) { store = null; }

  const subs = new Set();
  let agendado = false;
  // várias gravações seguidas viram um aviso só (a tela redesenha uma vez)
  const avisar = () => { if (agendado) return; agendado = true; setTimeout(() => { agendado = false; subs.forEach((f) => f()); }, 0); };
  const copia = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  let pediuPersistir = false;

  function gravar(path, valor) {
    const antes = store[path];
    if (valor === undefined) delete store[path]; else store[path] = copia(valor);
    try { localStorage.setItem(KEY, JSON.stringify(store)); }
    catch (e) {
      if (antes === undefined) delete store[path]; else store[path] = antes;
      const err = new Error("Sem espaço para guardar os dados."); err.code = "quota_exceeded"; throw err;
    }
    if (!pediuPersistir && navigator.storage && navigator.storage.persist) { pediuPersistir = true; navigator.storage.persist().catch(() => {}); }
    avisar();
  }
  const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const snapDoc = (path) => {
    const v = store[path];
    return { id: path.split("/").pop(), exists: v !== undefined, data: () => copia(v) };
  };
  const filhos = (path) => Object.keys(store).filter((p) => p.startsWith(path + "/") && !p.slice(path.length + 1).includes("/")).map(snapDoc);
  const ouvir = (fn) => { subs.add(fn); setTimeout(fn, 0); return () => subs.delete(fn); };

  function docRef(path) {
    return {
      id: path.split("/").pop(), path,
      async get() { return snapDoc(path); },
      async set(d) { gravar(path, d); },
      async update(d) { gravar(path, { ...(store[path] || {}), ...d }); },
      async delete() { gravar(path, undefined); },
      onSnapshot(next, onErr) { return ouvir(() => { try { next(snapDoc(path)); } catch (e) { if (onErr) onErr(e); } }); },
      collection: (nome) => colRef(path + "/" + nome),
    };
  }
  function colRef(path) {
    return {
      path,
      doc: (id) => docRef(path + "/" + (id || novoId())),
      async add(d) { const r = docRef(path + "/" + novoId()); await r.set(d); return r; },
      async get() { const docs = filhos(path); return { docs, size: docs.length, empty: !docs.length }; },
      onSnapshot(next, onErr) { return ouvir(() => { try { const docs = filhos(path); next({ docs, size: docs.length, empty: !docs.length }); } catch (e) { if (onErr) onErr(e); } }); },
    };
  }

  // outra aba do app mudou os dados: recarrega e redesenha
  addEventListener("storage", (e) => {
    if (e.key !== KEY || !store) return;
    try { store = JSON.parse(e.newValue || "{}"); avisar(); } catch (err) { /* ignora */ }
  });

  // salvar arquivo (cópia de segurança, CSV, PDF)
  const ehIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const tipoDe = (nome) => (/\.json$/i.test(nome) ? "application/json" : /\.csv$/i.test(nome) ? "text/csv;charset=utf-8" : /\.pdf$/i.test(nome) ? "application/pdf" : "application/octet-stream");
  const downloads = {
    // compartilhar: abre o menu de compartilhar também no Android (cópia de segurança: Drive, WhatsApp, e-mail)
    async save({ filename, data, compartilhar, titulo }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: tipoDe(filename) });
      // no iPhone, o menu de compartilhar é o jeito certo de guardar em Arquivos, Drive ou WhatsApp
      if ((ehIOS || compartilhar) && navigator.canShare) {
        let file = new File([blob], filename, { type: blob.type || tipoDe(filename) });
        // o Chrome do Android não compartilha .json; como texto ele vai (e Restaurar cópia aceita os dois)
        if (compartilhar && !navigator.canShare({ files: [file] }) && /\.json$/i.test(filename)) file = new File([blob], filename.replace(/\.json$/i, ".txt"), { type: "text/plain" });
        if (navigator.canShare({ files: [file] })) {
          try { await navigator.share(titulo ? { files: [file], title: titulo } : { files: [file] }); return { status: "saved", compartilhado: true }; }
          catch (e) { if (e && e.name === "AbortError") { const err = new Error("cancelado"); err.code = "cancelled"; throw err; } }
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return { status: "saved" };
    },
  };

  window.localApp = {
    async use(nome) {
      if (nome === "db") return store ? { doc: docRef, collection: colRef } : null;
      if (nome === "user") return { id: async () => "local" };
      if (nome === "downloads") return downloads;
      return null; // leitura de print com IA só existe no protótipo dentro do Claude
    },
  };
})();
