/* RLCAR — cópia de segurança no Google Drive do próprio motorista.
   Só liga quando config.js tem o googleClientId. A cópia fica na pasta escondida do app no Drive
   (appDataFolder): o motorista não vê o arquivo, outros apps não leem, e só este app escreve nela.
   O login do Google precisa de um toque (o navegador bloqueia a janela sem toque). Depois dele,
   a liberação vale por cerca de 1 hora; nesse tempo o app salva sozinho. */
(() => {
  const cfg = window.CAIXA_CONFIG || {};
  const ID = String(cfg.googleClientId || "").trim();
  if (!/\.apps\.googleusercontent\.com$/.test(ID)) return;
  const ESCOPO = "https://www.googleapis.com/auth/drive.appdata";
  const NOME = "caixa-motorista-copia.json";
  const API = "https://www.googleapis.com/drive/v3/files";
  const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
  let token = null, validade = 0, carregando = null, arquivoId = null;

  const erro = (code, msg) => { const e = new Error(msg || code); e.code = code; return e; };
  const conectado = () => !!token && Date.now() < validade;

  function carregarGoogle() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (!carregando) carregando = new Promise((ok, falha) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = ok;
      s.onerror = () => { carregando = null; falha(erro("sem_internet")); };
      document.head.appendChild(s);
    });
    return carregando;
  }
  // abre a janela do Google; tem que ser chamado logo depois de um toque
  async function entrar() {
    await carregarGoogle();
    return new Promise((ok, falha) => {
      const cliente = google.accounts.oauth2.initTokenClient({
        client_id: ID, scope: ESCOPO,
        callback: (r) => {
          if (!r || r.error || !r.access_token) return falha(erro(r && r.error === "access_denied" ? "cancelado" : "login"));
          if (google.accounts.oauth2.hasGrantedAllScopes && !google.accounts.oauth2.hasGrantedAllScopes(r, ESCOPO)) return falha(erro("sem_permissao"));
          token = r.access_token; validade = Date.now() + (Number(r.expires_in) || 3600) * 1000 - 60000;
          ok();
        },
        error_callback: (e) => falha(erro(e && e.type === "popup_closed" ? "cancelado" : "login")),
      });
      cliente.requestAccessToken();
    });
  }
  async function garantir(interativo) {
    if (conectado()) return;
    if (!interativo) throw erro("precisa_tocar");
    await entrar();
  }
  async function pedir(url, opcoes = {}) {
    let r;
    try { r = await fetch(url, { ...opcoes, headers: { ...(opcoes.headers || {}), Authorization: "Bearer " + token } }); }
    catch (e) { throw erro("sem_internet"); }
    if (r.status === 401) { token = null; throw erro("precisa_tocar"); }
    if (r.status === 403) throw erro("sem_permissao");
    if (!r.ok) throw erro("drive", "Google Drive respondeu " + r.status);
    return r;
  }
  async function acharArquivo() {
    if (arquivoId) return arquivoId;
    const q = encodeURIComponent("name='" + NOME + "' and trashed=false");
    const r = await pedir(API + "?spaces=appDataFolder&fields=files(id,modifiedTime)&orderBy=modifiedTime%20desc&q=" + q);
    const j = await r.json();
    arquivoId = j.files && j.files[0] ? j.files[0].id : null;
    return arquivoId;
  }

  window.googleDrive = {
    conectado,
    // grava a cópia (texto JSON); devolve a data da gravação
    async salvar(texto, { interativo = false } = {}) {
      await garantir(interativo);
      const id = await acharArquivo();
      if (id) {
        await pedir(UPLOAD + "/" + id + "?uploadType=media", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: texto });
      } else {
        const limite = "caixa" + Math.random().toString(36).slice(2);
        const corpo = "--" + limite + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify({ name: NOME, parents: ["appDataFolder"] }) +
          "\r\n--" + limite + "\r\nContent-Type: application/json\r\n\r\n" + texto + "\r\n--" + limite + "--";
        const r = await pedir(UPLOAD + "?uploadType=multipart&fields=id", { method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + limite }, body: corpo });
        arquivoId = (await r.json()).id;
      }
      return Date.now();
    },
    // traz a cópia guardada (texto JSON) ou null se ainda não há nenhuma
    async baixar({ interativo = false } = {}) {
      await garantir(interativo);
      const id = await acharArquivo();
      if (!id) return null;
      return (await pedir(API + "/" + id + "?alt=media")).text();
    },
  };
})();
