// Testes automáticos do RLCAR.
// Cada teste abre o app num celular simulado (Android e iPhone), usa como um motorista usaria e confere os números.
// A Tabela FIPE e a ANP são simuladas aqui, para o teste não depender da internet nem do preço da semana.
const fs = require("fs");
const { test, expect } = require("@playwright/test");

const CHAVE = "caixa-motorista:dados:v1"; // onde o app guarda os dados no celular (local.js)
const BASE = "data/users/local/app";
const FUSO = "America/Sao_Paulo";
const JA_VIU = { tutorialVisto: true, novidadesVistas: 999 }; // sem tutorial nem novidades no caminho dos testes

// datas no fuso de Brasília, o mesmo dos celulares simulados
function dia(n = 0) {
  return new Date(Date.now() + n * 864e5).toLocaleDateString("sv-SE", { timeZone: FUSO });
}
function emMeses(n) {
  const [y, m, d] = dia(0).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, ultimo));
  return t.toISOString().slice(0, 10);
}

// monta os dados que o app encontra ao abrir (como se o motorista já tivesse usado)
function dados(colecoes = {}, ajustes = {}) {
  const loja = { [BASE]: { servicosPadrao: true, ...JA_VIU, ...ajustes } };
  for (const [nome, docs] of Object.entries(colecoes)) {
    docs.forEach((d, i) => { const { id = nome + i, ...resto } = d; loja[`${BASE}/${nome}/${id}`] = resto; });
  }
  return loja;
}
async function abrir(page, loja = { [BASE]: { ...JA_VIU } }) {
  if (loja) {
    // grava só na primeira abertura da aba; depois de recarregar, valem os dados que o app salvou
    await page.addInitScript(([k, v]) => {
      if (!sessionStorage.getItem("semeado")) { localStorage.setItem(k, v); sessionStorage.setItem("semeado", "1"); }
    }, [CHAVE, JSON.stringify(loja)]);
  }
  await page.goto("./");
  await expect(page.locator("#tab-inicio .lucro")).not.toHaveText("…");
}
const dBRcurto = (d) => d.slice(8, 10) + "/" + d.slice(5, 7); // "2026-10-25" vira "25/10", como o app mostra
const aba = (page, nome) => page.locator(`.tab[data-tab="${nome}"]`).click();
const parte = (page, nome) => page.locator(`[data-csub="${nome}"]`).click();
const lerLoja = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), CHAVE);
const semCompartilhar = (page) => page.addInitScript(() => {
  try { delete Navigator.prototype.share; delete Navigator.prototype.canShare; } catch (e) { /* nada */ }
});

// ---------- Tabela FIPE simulada (mesmo formato da BrasilAPI) ----------
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
// tabela 330 = outubro/2026 (a mais nova), 318 = outubro/2025
const TABELAS = Array.from({ length: 15 }, (_, i) => { const k = 2026 * 12 + 9 - i; return { codigo: 330 - i, mes: MESES[k % 12] + "/" + Math.floor(k / 12) + " " }; });
const MODELOS = [
  ...Array.from({ length: 14 }, (_, i) => ({ modelo: "CRUZE LT 1.4 Turbo versão " + i, valor: String(8000 + i) })),
  { modelo: "ONIX HATCH LT 1.0 12V Flex 5p Mec.", valor: "9001" },
];
function fipeFalsa(route) {
  const u = new URL(route.request().url());
  const p = u.pathname.replace("/api/fipe", "");
  const ref = u.searchParams.get("tabela_referencia");
  let corpo = null;
  if (p === "/tabelas/v1") corpo = TABELAS;
  else if (p === "/marcas/v1/carros") corpo = [{ nome: "Fiat", valor: "21" }, { nome: "GM - Chevrolet", valor: "23" }];
  else if (p === "/veiculos/v1/carros/23") corpo = MODELOS;
  else if (p === "/anos/v1/carros/23/9001") corpo = [{ nome: "2021 Gasolina", valor: "2021-1" }, { nome: "2020 Gasolina", valor: "2020-1" }];
  else if (p === "/detalhes/v1/carros/23/9001/2020-1") {
    corpo = ref === "318"
      ? { valor: "R$ 65.000,00", mesReferencia: "outubro de 2025 ", codigoFipe: "004461-0", anoModelo: 2020, combustivel: "Gasolina" }
      : { valor: "R$ 60.000,00", mesReferencia: "outubro de 2026 ", codigoFipe: "004461-0", anoModelo: 2020, combustivel: "Gasolina" };
  }
  const headers = { "access-control-allow-origin": "*" };
  if (!corpo) return route.fulfill({ status: 404, contentType: "application/json", headers, body: '{"message":"não achei"}' });
  return route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify(corpo) });
}

// ---------- preços da ANP simulados (mesmo formato que o robô anp.py grava) ----------
function anpFalso() {
  return {
    fonte: "teste",
    semana: { inicio: dia(-13), fim: dia(-7) },
    estados: {
      SP: { nome: "São Paulo", precos: { Gasolina: { medio: 6.2, min: 5.79, max: 7.19, postos: 900 }, Etanol: { medio: 4.2, min: 3.79, max: 5.19, postos: 800 } } },
      RJ: { nome: "Rio de Janeiro", precos: { Gasolina: { medio: 6.4 } } },
    },
    municipios: {
      "SP|sao paulo": { nome: "São Paulo", uf: "SP", precos: { Gasolina: { medio: 6.1, min: 5.59, max: 6.99, postos: 120 }, Etanol: { medio: 4.0, min: 3.69, max: 4.59, postos: 110 } } },
      "SP|campinas": { nome: "Campinas", uf: "SP", precos: { Gasolina: { medio: 6.0 } } },
    },
    anterior: { estados: { SP: { Gasolina: 6.25 } }, municipios: { "SP|sao paulo": { Gasolina: 6.05, Etanol: 4.1 } } },
  };
}

test.beforeEach(async ({ page, context }) => {
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.__erros = erros;
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await context.route(/js\.sentry-cdn\.com/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "window.__sentry = (window.__sentry || 0) + 1;" }));
  await context.route(/brasilapi\.com\.br\/api\/fipe/, fipeFalsa);
  await context.route(/\/dados\/anp\.json/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(anpFalso()) }));
});
test.afterEach(async ({ page }) => {
  expect(page.__erros || [], "o app deu erro de JavaScript").toEqual([]);
});

test("abre e pode ser instalado", async ({ page, request }) => {
  await abrir(page);
  await expect(page).toHaveTitle(/RLCAR/);
  const manifesto = await (await request.get(await page.locator('link[rel="manifest"]').getAttribute("href"))).json();
  expect(manifesto.name).toBe("RLCAR");
  expect(manifesto.display).toBe("standalone");
  for (const icone of manifesto.icons) expect((await request.get(icone.src)).ok(), icone.src).toBeTruthy();
  await expect(page.locator("#offline")).toBeHidden();
  await expect(page.locator(".btn-print")).toHaveCount(0); // leitura de print com IA só existe dentro do Claude
});

test("primeira vez: o app já vem com a lista de manutenção", async ({ page }) => {
  await abrir(page);
  await aba(page, "carro");
  await parte(page, "manut");
  await expect(page.locator(".mrow")).toHaveCount(13);
});

test("lança ganho e abastecimento, e os dados continuam depois de fechar", async ({ page }) => {
  await abrir(page, dados());
  await page.click("#fab");
  await page.click('[data-cat="Uber"]');
  await page.fill("#fValor", "200");
  await page.fill("#fSep", "20");
  await page.click("#fSave");
  await expect(page.locator("#sheet")).toBeHidden();
  await page.click("#fab");
  await page.click('[data-tipo="gasto"]');
  await page.click('[data-cat="Combustível"]');
  await page.fill("#fValor", "150");
  await page.fill("#fLit", "25");
  await page.fill("#fKm", "50000");
  await page.click("#fSave");
  await expect(page.locator(".lucro")).toContainText("50,00");
  await page.reload();
  await expect(page.locator(".lucro")).toContainText("50,00");
  const loja = await lerLoja(page);
  expect(Object.keys(loja).filter((k) => k.includes("/lancamentos/"))).toHaveLength(2);
});

test("KM com um zero a mais pede confirmação, e a tela de KM mostra onde está o erro", async ({ page }) => {
  await abrir(page, dados({ lancamentos: [{ data: dia(-5), tipo: "gasto", cat: "Combustível", comb: "Gasolina", cheio: true, valor: 200, litros: 33, km: 50000, ts: 1 }] }));
  await page.click("#fab");
  await page.click('[data-tipo="gasto"]');
  await page.click('[data-cat="Combustível"]');
  await page.fill("#fValor", "150");
  await page.fill("#fLit", "25");
  await page.fill("#fKm", "500000");
  await page.click("#fSave");
  await expect(page.locator("#fErr")).toContainText("Confira o painel");
  await expect(page.locator("#sheet")).toBeVisible();
  await page.click("#fSave"); // estava certo: segundo toque salva
  await expect(page.locator("#sheet")).toBeHidden();
  // corrigir pela tela de KM não adianta: ela aponta o lançamento com o KM maior
  await aba(page, "carro");
  await page.click("#setKm");
  await page.fill("#kK", "50500");
  await page.click("#fSave");
  await expect(page.locator("#fErr")).toContainText("500.000");
  await expect(page.locator("#fErr")).toContainText("Histórico");
  // um KM normal salva de primeira
  await page.click("#fCancel");
  await page.click("#fab");
  await page.click('[data-tipo="gasto"]');
  await page.click('[data-cat="Combustível"]');
  await page.fill("#fValor", "100");
  await page.fill("#fKm", "500400");
  await page.click("#fSave");
  await expect(page.locator("#sheet")).toBeHidden();
});

test("no iPhone, pelo Safari, avisa para instalar antes de anotar", async ({ page, browserName }) => {
  await abrir(page);
  if (browserName !== "webkit") { await expect(page.locator("#iosInst")).toBeHidden(); return; }
  await expect(page.locator("#iosInst")).toBeVisible();
  await page.click("#iosOk");
  await expect(page.locator("#iosInst")).toBeHidden();
  await page.reload();
  await expect(page.locator("#tab-inicio .lucro")).not.toHaveText("…");
  await expect(page.locator("#iosInst")).toBeHidden();
});

test("consumo por litro e qual combustível colocar", async ({ page }) => {
  const abastece = (d, km) => ({ data: dia(d), tipo: "gasto", cat: "Combustível", comb: "Gasolina", cheio: true, valor: 250, litros: 40, km, ts: 100 + d });
  await abrir(page, dados({ lancamentos: [abastece(-30, 40000), abastece(-20, 40480), abastece(-10, 40960)] }));
  await aba(page, "carro");
  await parte(page, "consumo");
  await expect(page.locator("#tab-carro .metrics")).toContainText("12,0");
  // etanol a 4,00 rende ~8,4 km/l (70% da gasolina): R$ 0,48 por km contra R$ 0,52 da gasolina
  await page.fill('input[data-pc="Gasolina"]', "6,25");
  await page.fill('input[data-pc="Etanol"]', "4,00");
  await expect(page.locator(".calc-out")).toContainText("Etanol");
  await expect(page.locator(".calc-out .cmp-out b").first()).toHaveText("Etanol");
  await page.fill('input[data-pc="Etanol"]', "4,80");
  await expect(page.locator(".calc-out .cmp-out b").first()).toHaveText("Gasolina");
});

test("caixinha: pneus de R$ 1.000 daqui a 2 anos = R$ 41,67 por mês, e separar mais não conta duas vezes", async ({ page }) => {
  await abrir(page, dados({ manutencao: [{ servico: "Troca de pneus", custo: 1000, proxData: emMeses(24), cadaKm: 40000, cadaMeses: 60 }] }));
  await aba(page, "carro");
  await parte(page, "custos");
  const pneus = page.locator(".meta-row", { hasText: "Troca de pneus" }); // a linha dos pneus, não o texto de exemplo
  const total = page.locator(".card", { hasText: "Caixinha do carro" }).locator(".custo-hero b.big");
  await expect(pneus).toContainText("R$ 41,67 /mês");
  await expect(pneus).toContainText("24 meses");
  await expect(total).toContainText("R$ 41,67");
  await aba(page, "inicio");
  await page.click("#addSep");
  await page.fill("#sV", "50");
  await page.click("#fSave");
  await expect(page.locator("#sheet")).toBeHidden();
  await aba(page, "carro");
  await expect(pneus).toContainText("R$ 41,67 /mês"); // o que foi separado neste mês vai para a meta do mês
  await expect(pneus).toContainText("já tem R$ 50,00");
  await expect(total).toContainText("R$ 41,67");
});

test("Tabela FIPE: valor do carro e quanto ele perde por ano", async ({ page }) => {
  await abrir(page, dados());
  await aba(page, "carro");
  await parte(page, "custos");
  await page.click("#fipeBtn");
  await page.selectOption("#fpMarca", "23");
  await expect(page.locator("#fpFiltro")).toBeVisible(); // lista grande: aparece o filtro
  await page.fill("#fpFiltro", "onix");
  await expect(page.locator("#fpModelo option")).toHaveCount(2);
  await page.selectOption("#fpModelo", "9001");
  await page.selectOption("#fpAno", "2020-1");
  // R$ 60.000 hoje e R$ 65.000 há 12 meses: perdeu 7,7% em um ano
  await expect(page.locator("#fpRes")).toContainText("60.000,00");
  await expect(page.locator("#fpRes")).toContainText("7,7%");
  await page.click("#fSave");
  await expect(page.locator("#sheet")).toBeHidden();
  const card = page.locator(".card.custo-hero").first();
  await expect(card).toContainText("Tabela FIPE (outubro de 2026)");
  await expect(card).toContainText("60.000,00");
  await expect(card).toContainText("perdeu 7,7% em 12 meses");
  await page.click("#editCustos");
  await expect(page.locator("#cf_valorCarro")).toHaveValue("60.000");
  await expect(page.locator("#cf_desvalPct")).toHaveValue("7,70");
  // salvar sem mudar nada mantém a FIPE atualizando sozinha
  await page.click("#fSave");
  await expect(page.locator("#toast")).toHaveText("Custos salvos");
  expect((await lerLoja(page))[BASE + "/carros/principal"].fipe.valor).toBe(60000);
});

test("Tabela FIPE: o valor do mês novo entra sozinho", async ({ page }) => {
  const car = {
    id: "principal", ts: 0, modelo: "Onix 1.0", combustivel: "Flex",
    custos: { valorCarro: 61000, desvalPct: 5 },
    fipe: { marca: "23", marcaNome: "GM - Chevrolet", modelo: "9001", modeloNome: "ONIX", ano: "2020-1", anoNome: "2020 Gasolina", valor: 61000, mes: "agosto de 2026", desval: 5, atualizado: dia(-40) },
  };
  await abrir(page, dados({ carros: [car] }));
  await expect.poll(async () => ((await lerLoja(page))[BASE + "/carros/principal"] || {}).custos?.valorCarro).toBe(60000);
  await aba(page, "carro");
  await parte(page, "custos");
  await expect(page.locator(".card.custo-hero").first()).toContainText("outubro de 2026");
});

test("preço da ANP: média da cidade, comparação e aviso ao abastecer", async ({ page }) => {
  const abastece = (d, km) => ({ data: dia(d), tipo: "gasto", cat: "Combustível", comb: "Gasolina", cheio: true, valor: 300, litros: 50, km, ts: 100 + d });
  await abrir(page, dados({ lancamentos: [abastece(-12, 40000), abastece(-3, 40600)] }));
  await aba(page, "carro");
  await parte(page, "consumo");
  await expect(page.locator(".card", { hasText: "Preço na sua cidade" })).toBeVisible();
  await page.click("#cidadeBtn");
  await page.selectOption("#cdUf", "SP");
  await page.selectOption("#cdCid", "SP|sao paulo");
  await page.click("#fSave");
  await expect(page.locator("#sheet")).toBeHidden();
  const card = page.locator(".card", { hasText: "Média em São Paulo/SP" });
  await expect(card).toContainText("6,10");
  await expect(card).toContainText("subiu R$ 0,05 na semana");
  await expect(card).toContainText("Você pagou R$ 6,00: 1,6% abaixo");
  // a calculadora começa com o preço da cidade para o combustível que você ainda não comprou
  await expect(page.locator('input[data-pc="Etanol"]')).toHaveValue("4,00");
  // ao abastecer: mostra a média e avisa se pagou acima
  await page.click("#fab");
  await page.click('[data-tipo="gasto"]');
  await page.click('[data-cat="Combustível"]');
  await expect(page.locator("#sheetBody")).toContainText("Média em São Paulo/SP nesta semana: R$ 6,10/L");
  await page.fill("#fValor", "250");
  await page.fill("#fLit", "40");
  await page.fill("#fKm", "41200");
  await page.click("#fSave");
  await expect(page.locator("#toast")).toContainText("R$ 0,15 a mais por litro que a média da cidade");
});

test("QR code para indicar o app", async ({ page }) => {
  await semCompartilhar(page);
  await abrir(page);
  await aba(page, "resumo");
  await expect(page.locator("#qrBox svg path")).toHaveCount(1);
  await expect(page.locator(".qr-link")).toHaveText("http://127.0.0.1:4173/");
  await page.click("#shareApp");
  await expect(page.locator("#toast")).toContainText(/Link copiado|127\.0\.0\.1/);
});

test("Sentry só liga quando o DSN está em config.js", async ({ page, context }) => {
  await page.route(/config\.js$/, (r) => r.fulfill({ contentType: "application/javascript", body: 'window.CAIXA_CONFIG = { sentryDsn: "" };' }));
  await abrir(page);
  expect(await page.evaluate(() => window.__sentry || 0)).toBe(0);
  const outra = await context.newPage();
  await outra.route(/config\.js$/, (r) => r.fulfill({ contentType: "application/javascript", body: 'window.CAIXA_CONFIG = { sentryDsn: "https://abc123def456@o1.ingest.us.sentry.io/42" };' }));
  const pedido = outra.waitForRequest(/js\.sentry-cdn\.com\/abc123def456\.min\.js/);
  await outra.goto("./");
  await pedido;
  await expect.poll(() => outra.evaluate(() => window.__sentry || 0)).toBe(1);
  expect(await outra.evaluate(() => typeof window.sentryOnLoad)).toBe("function");
});

test("o config.js publicado liga o Sentry do RLCAR", async ({ page }) => {
  const pedido = page.waitForRequest(/js\.sentry-cdn\.com\/1a4bd5fe177900fbb4cbde862ab165b7\.min\.js/);
  await abrir(page);
  await pedido;
});

test("cópia de segurança: salva e restaura em outro celular", async ({ page }, info) => {
  await semCompartilhar(page);
  await abrir(page, dados({ lancamentos: [
    { data: dia(0), tipo: "ganho", cat: "Uber", trabalho: true, valor: 200, sep: 20, ts: 1 },
    { data: dia(0), tipo: "gasto", cat: "Lavagem", valor: 40, ts: 2 },
  ] }));
  await expect(page.locator(".lucro")).toContainText("160,00");
  await aba(page, "resumo");
  const [arquivo] = await Promise.all([page.waitForEvent("download"), page.click("#bkSave")]);
  const caminho = info.outputPath("copia.json");
  await arquivo.saveAs(caminho);
  const copia = JSON.parse(fs.readFileSync(caminho, "utf8"));
  expect(copia.app).toBe("caixa-do-motorista");
  expect(copia.colecoes.lancamentos).toHaveLength(2);
  // "outro celular": apaga tudo e restaura pela cópia
  await page.evaluate((k) => localStorage.removeItem(k), CHAVE);
  await page.reload();
  await page.click("#tutPular");
  await expect(page.locator(".lucro")).toContainText("0,00");
  await aba(page, "resumo");
  await page.click("#bkLoad");
  // arquivo passado em memória: o caminho da pasta do teste tem acento
  await page.setInputFiles("#bkIn", { name: "copia.json", mimeType: "application/json", buffer: fs.readFileSync(caminho) });
  await expect(page.locator("#bkMsg")).toContainText("2 registros");
  await page.click("#fSave");
  await page.click("#fSave"); // segundo toque confirma
  await expect(page.locator("#sheet")).toBeHidden();
  await aba(page, "inicio");
  await expect(page.locator(".lucro")).toContainText("160,00");
  // arquivo que não é cópia é recusado
  await aba(page, "resumo");
  await page.click("#bkLoad");
  await page.setInputFiles("#bkIn", { name: "errado.json", mimeType: "application/json", buffer: Buffer.from('{"x":1}') });
  await expect(page.locator("#fErr")).toContainText("não é uma cópia");
  await expect(page.locator("#fSave")).toBeDisabled();
});

test("celular novo ou formatado: a cópia vai pelo menu de compartilhar e volta pelo Resumo", async ({ page }) => {
  // menu de compartilhar como o do Chrome no Android: aceita texto, recusa .json
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "canShare", { configurable: true, value: (d) => !!(d && d.files && /\.txt$/.test(d.files[0].name)) });
    Object.defineProperty(Navigator.prototype, "share", { configurable: true, value: async (d) => { window.__compartilhado = { nome: d.files[0].name, texto: await d.files[0].text() }; } });
  });
  await abrir(page, dados({ lancamentos: [{ data: dia(0), tipo: "ganho", cat: "Uber", trabalho: true, valor: 300, sep: 30, ts: 1 }] }, { ultimoBackup: Date.now() - 8 * 864e5 }));
  // lembra depois de uma semana sem cópia
  await expect(page.locator(".alerts")).toContainText("Cópia de segurança");
  await expect(page.locator(".alerts")).toContainText("8 dias");
  await expect(page.locator("#restIni")).toHaveCount(0);
  await aba(page, "resumo");
  await page.click("#bkSave");
  await expect(page.locator("#toast")).toContainText("Cópia enviada");
  const enviado = await page.evaluate(() => window.__compartilhado);
  expect(enviado.nome).toMatch(/^rlcar-copia-.*\.txt$/);
  expect(JSON.parse(enviado.texto).colecoes.lancamentos).toHaveLength(1);
  await aba(page, "inicio");
  await expect(page.locator(".alerts")).toHaveCount(0);
  // formatou: o app abre vazio, sem aviso no início, e a cópia volta pelo Resumo
  await page.evaluate((k) => localStorage.removeItem(k), CHAVE);
  await page.reload();
  await page.click("#tutPular");
  await expect(page.locator("#restIni")).toHaveCount(0);
  await aba(page, "resumo");
  await page.click("#bkLoad");
  await page.setInputFiles("#bkIn", { name: enviado.nome, mimeType: "text/plain", buffer: Buffer.from(enviado.texto) });
  await expect(page.locator("#bkMsg")).toContainText("1 registro");
  await page.click("#fSave");
  await page.click("#fSave");
  await expect(page.locator("#sheet")).toBeHidden();
  await aba(page, "inicio");
  await expect(page.locator(".lucro")).toContainText("300,00");
});

test("Google Drive: salva na conta do motorista, salva sozinho depois e restaura no celular novo", async ({ page, context }) => {
  // config com o ID do cliente, login do Google e Drive simulados (o arquivo fica guardado aqui no teste)
  await context.route(/\/config\.js$/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: 'window.CAIXA_CONFIG = { sentryDsn: "", googleClientId: "123-abc.apps.googleusercontent.com" };' }));
  await context.route(/accounts\.google\.com\/gsi\/client/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: `
    window.__logins = 0;
    window.google = { accounts: { oauth2: {
      hasGrantedAllScopes: () => true,
      initTokenClient: (o) => ({ requestAccessToken: () => { window.__logins++; setTimeout(() => o.callback({ access_token: "tok", expires_in: 3600 }), 0); } }),
    } } };` }));
  const drive = { id: null, texto: null };
  await context.route(/www\.googleapis\.com/, async (r) => {
    const req = r.request(), u = new URL(req.url());
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PATCH" };
    if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    expect(req.headers()["authorization"]).toBe("Bearer tok");
    const json = (o) => r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(o) });
    if (u.pathname === "/drive/v3/files") { expect(u.searchParams.get("spaces")).toBe("appDataFolder"); return json({ files: drive.id ? [{ id: drive.id }] : [] }); }
    if (u.pathname === "/upload/drive/v3/files" && req.method() === "POST") {
      const corpo = req.postData();
      expect(corpo).toContain('"parents":["appDataFolder"]');
      drive.id = "arq1"; drive.texto = corpo.split("\r\n\r\n")[2].split("\r\n--")[0];
      return json({ id: drive.id });
    }
    if (u.pathname === "/upload/drive/v3/files/arq1" && req.method() === "PATCH") { drive.texto = req.postData(); return json({ id: drive.id }); }
    if (u.pathname === "/drive/v3/files/arq1") return r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: drive.texto });
    return r.fulfill({ status: 404, headers: cors, body: "" });
  });
  await abrir(page, dados({ lancamentos: [{ data: dia(0), tipo: "ganho", cat: "Uber", trabalho: true, valor: 300, sep: 30, ts: 1 }] }));
  await aba(page, "resumo");
  await page.click("#gSave");
  await expect(page.locator("#toast")).toContainText("Google Drive");
  expect(JSON.parse(drive.texto).colecoes.lancamentos).toHaveLength(1);
  // o que anotar depois salva sozinho, sem novo login
  await page.click("#fab");
  await page.click('[data-tipo="gasto"]');
  await page.click('[data-cat="Lavagem"]');
  await page.fill("#fValor", "50");
  await page.click("#fSave");
  await expect.poll(() => drive.texto && JSON.parse(drive.texto).colecoes.lancamentos.length, { timeout: 15000 }).toBe(2);
  expect(await page.evaluate(() => window.__logins)).toBe(1);
  // fechou e abriu o app dentro da hora: continua salvando sozinho, sem pedir login
  await page.reload();
  await page.click("#fab");
  await page.click('[data-tipo="gasto"]');
  await page.click('[data-cat="Lavagem"]');
  await page.fill("#fValor", "20");
  await page.click("#fSave");
  await expect.poll(() => JSON.parse(drive.texto).colecoes.lancamentos.length, { timeout: 15000 }).toBe(3);
  expect(await page.evaluate(() => window.__logins || 0)).toBe(0);
  // celular novo: vazio, não deixa salvar por cima da cópia boa, e restaura pelo Google
  await page.evaluate((k) => localStorage.removeItem(k), CHAVE);
  await page.reload();
  await page.click("#tutPular");
  await aba(page, "resumo");
  await page.click("#gSave");
  await expect(page.locator("#toast")).toContainText("Ainda não há nada");
  expect(JSON.parse(drive.texto).colecoes.lancamentos).toHaveLength(3);
  await page.click("#bkLoad");
  await page.click("#gBusca");
  await expect(page.locator("#bkMsg")).toContainText("3 registros");
  await page.click("#fSave");
  await page.click("#fSave");
  await expect(page.locator("#sheet")).toBeHidden();
  await aba(page, "inicio");
  await expect(page.locator(".lucro")).toContainText("230,00");
});

test("sem o ID do Google em config.js, os botões do Google ficam escondidos", async ({ page, context }) => {
  await context.route(/\/config\.js$/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: 'window.CAIXA_CONFIG = { sentryDsn: "", googleClientId: "" };' }));
  await abrir(page, dados({ lancamentos: [{ data: dia(0), tipo: "ganho", cat: "Uber", trabalho: true, valor: 100, ts: 1 }] }));
  await aba(page, "resumo");
  await expect(page.locator("#bkSave")).toBeVisible();
  await expect(page.locator("#gSave")).toHaveCount(0);
  await page.click("#bkLoad");
  await expect(page.locator("#gBusca")).toHaveCount(0);
});

test("primeira vez: tutorial; depois, as novidades que ficaram para trás aparecem juntas", async ({ page }) => {
  await abrir(page, null);
  await expect(page.locator("#tutTit")).toHaveText("Bem-vindo ao RLCAR");
  await page.click("#tutProx");
  await expect(page.locator("#tutTit")).toContainText("ganhos e gastos");
  await page.click("#tutVolta");
  await expect(page.locator("#tutTit")).toHaveText("Bem-vindo ao RLCAR");
  for (let i = 0; i < 4; i++) await page.click("#tutProx");
  await expect(page.locator("#tutRest")).toBeVisible();
  await page.click("#tutProx"); // Começar
  await expect(page.locator("#sheet")).toBeHidden();
  // quem acabou de chegar não vê as novidades antigas, nem o tutorial de novo
  await page.reload();
  await expect(page.locator("#tab-inicio .lucro")).not.toHaveText("…");
  await page.waitForTimeout(300);
  await expect(page.locator("#sheet")).toBeHidden();
  // no Resumo dá para rever
  await aba(page, "resumo");
  await page.click("#verNov");
  await expect(page.locator("#novTit")).toBeVisible();
  await page.click("#novOk");
  await page.click("#verTut");
  await expect(page.locator("#tutTit")).toHaveText("Bem-vindo ao RLCAR");
});

test("quem já usava e ficou sem abrir vê as novidades uma vez, sem o tutorial", async ({ page }) => {
  await abrir(page, dados({ lancamentos: [{ data: dia(0), tipo: "ganho", cat: "Uber", trabalho: true, valor: 100, ts: 1 }] }, { tutorialVisto: undefined, novidadesVistas: 0 }));
  await expect(page.locator("#novTit")).toBeVisible();
  await expect(page.locator("#sheet")).toContainText("RLCAR");
  await expect(page.locator("#sheet")).toContainText("Novo ícone"); // as duas atualizações juntas
  await expect(page.locator("#tutTit")).toHaveCount(0);
  await page.click("#novOk");
  await page.reload();
  await expect(page.locator("#tab-inicio .lucro")).not.toHaveText("…");
  await page.waitForTimeout(300);
  await expect(page.locator("#sheet")).toBeHidden();
});

test.describe("no Chrome", () => {
  test.use({ serviceWorkers: "allow" });

  test("abre sem internet, com os dados", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "o modo sem internet é testado no Chrome");
    await abrir(page, dados({ lancamentos: [{ data: dia(0), tipo: "ganho", cat: "Uber", trabalho: true, valor: 120, ts: 1 }] }));
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20_000 });
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator(".lucro")).toContainText("120,00");
    await context.setOffline(false);
  });

  test("o Chrome reconhece como app instalável", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "só o Chrome informa isso");
    await abrir(page);
    const cdp = await page.context().newCDPSession(page);
    const r = await cdp.send("Page.getInstallabilityErrors");
    expect(r.installabilityErrors).toEqual([]);
  });
});

test("novo carro: escolhendo marca, modelo e ano na FIPE, o resto se preenche sozinho", async ({ page }) => {
  await abrir(page, dados());
  await aba(page, "carro");
  await page.click("#addCar");
  await page.selectOption("#cfMarca", "23");
  await page.fill("#cfModelo", "onix");
  await expect(page.locator(".sug")).toHaveCount(1); // a lista filtra enquanto digita
  await page.click('[data-mod="9001"]');
  await expect(page.locator("#cfModelo")).toHaveValue("ONIX HATCH LT 1.0 12V Flex 5p Mec.");
  await page.fill("#cP", "abc1d23");
  await page.selectOption("#cfAno", "2020-1");
  await expect(page.locator("#cfOk")).toContainText("60.000,00");
  await expect(page.locator("#cfOk")).toContainText("ONIX HATCH LT 1.0 12V Flex 5p Mec.");
  await expect(page.locator("#cfMarca")).toHaveCount(0); // modelo e ano não se repetem
  await expect(page.locator("#cM")).toBeHidden();
  await expect(page.locator("#cM")).toHaveValue("ONIX HATCH LT 1.0 12V Flex 5p Mec.");
  await expect(page.locator("#cA")).toHaveValue("2020");
  await expect(page.locator("#cT")).toHaveValue("44");
  await expect(page.locator("#cP")).toHaveValue("abc1d23");
  await expect(page.locator('[data-cc="Flex"]')).toHaveAttribute("aria-pressed", "true");
  await page.click("#fSave");
  await expect(page.locator("#sheet")).toBeHidden();
  const carro = Object.entries(await lerLoja(page)).find(([k, v]) => k.includes("/carros/") && v && v.placa === "ABC1D23")[1];
  expect(carro.ano).toBe(2020);
  expect(carro.tanque).toBe(44);
  expect(carro.fipe.valor).toBe(60000);
  expect(carro.custos.valorCarro).toBe(60000);
});

test("novo carro: se a BrasilAPI falha, busca na reserva; e dá para digitar à mão", async ({ page }) => {
  await page.route(/brasilapi\.com\.br\/api\/fipe\/(anos|detalhes)/, (r) => r.fulfill({ status: 500, headers: { "access-control-allow-origin": "*" }, body: "" }));
  const pedidos = [];
  await page.route(/parallelum\.com\.br/, (r) => {
    const u = new URL(r.request().url()).pathname; pedidos.push(u);
    const json = (o) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(o) });
    if (u.endsWith("/marcas/23/modelos/9001/anos")) return json([{ codigo: "2020-1", nome: "2020 Gasolina" }]);
    if (u.endsWith("/marcas/23/modelos/9001/anos/2020-1")) return json({ Valor: "R$ 58.000,00", MesReferencia: "outubro de 2026", CodigoFipe: "004461-0", Combustivel: "Gasolina", AnoModelo: 2020 });
    return r.fulfill({ status: 404, body: "" });
  });
  await abrir(page, dados());
  await aba(page, "carro");
  await page.click("#addCar");
  await expect(page.locator("#cM")).toBeHidden(); // só a busca, sem campos repetidos
  await page.selectOption("#cfMarca", "23");
  await page.fill("#cfModelo", "onix");
  await expect(page.locator(".sug")).toHaveCount(1); // a lista filtra enquanto digita
  await page.click('[data-mod="9001"]');
  await expect(page.locator("#cfModelo")).toHaveValue("ONIX HATCH LT 1.0 12V Flex 5p Mec.");
  await page.selectOption("#cfAno", "2020-1");
  await expect(page.locator("#cfOk")).toContainText("58.000,00");
  expect(pedidos.length).toBeGreaterThan(0);
  // trocar e digitar à mão
  await page.click("#cfTrocar");
  await page.click("#cfMao");
  await expect(page.locator("#cM")).toBeVisible();
  await page.fill("#cM", "Fusca 1300");
  await page.fill("#cA", "1975");
  await page.click("#fSave");
  await expect(page.locator("#sheet")).toBeHidden();
  const carro = Object.entries(await lerLoja(page)).find(([k, v]) => k.includes("/carros/") && v && v.modelo === "Fusca 1300")[1];
  expect(carro.ano).toBe(1975);
  expect(carro.fipe).toBeUndefined();
});

test("Trabalho no mês mostra só o essencial e abre o resto ao tocar no título", async ({ page }) => {
  await abrir(page, dados({ lancamentos: [{ data: dia(0), tipo: "ganho", cat: "Uber", trabalho: true, valor: 100, ts: 1 }], dias: [{ data: dia(0), horas: 5, corridas: 10, kmIni: 1000, kmFim: 1100, kmPass: 70 }] }));
  const quadro = page.locator("#tab-inicio .metrics").first();
  await expect(quadro).not.toContainText("Ganho por hora");
  await expect(page.locator("#jorIni")).toHaveCount(0); // sem o botão "Começar a trabalhar"
  await expect(quadro).toContainText("Ganhos nos apps");
  await expect(quadro).toContainText("Previsão do mês");
  await expect(quadro).not.toContainText("Lucro por dia");
  await expect(quadro).not.toContainText("Km rodados vazio");
  await page.click("#trabMais");
  await expect(quadro).not.toContainText("por hora"); // nem ganho nem lucro por hora
  await expect(quadro).toContainText("Lucro por dia");
  await expect(quadro).toContainText("Ganho por km c/ passageiro");
  await page.reload(); // fica lembrado
  await expect(page.locator("#tab-inicio .metrics").first()).toContainText("Lucro por dia");
  await page.click("#trabMais2");
  await expect(page.locator("#tab-inicio .metrics").first()).not.toContainText("Lucro por dia");
});

test("telas limpas: sem quadros vazios nem informação repetida", async ({ page }) => {
  await abrir(page, dados({ lancamentos: [{ data: dia(0), tipo: "gasto", cat: "Combustível", comb: "Gasolina", valor: 100, litros: 16, ts: 1 }] }));
  // Início: sem números extras ainda, então não há "ver mais"; sem KM no destaque do mês
  await expect(page.locator("#trabMais2")).toHaveCount(0);
  await expect(page.locator("#tab-inicio .placa")).not.toContainText("KM");
  // Carro: um carro só, sem fileira de carros; o combustível do mês não se repete aqui
  await aba(page, "carro");
  await expect(page.locator("#tab-carro .car-tabs")).toHaveCount(0);
  await expect(page.locator("#tab-carro .metrics")).not.toContainText("Combustível no mês");
  await expect(page.locator("#tab-carro .metrics")).not.toContainText("—");
  // Resumo: só os meses com algo anotado; sem cartão de ganhos vazio
  await aba(page, "resumo");
  await expect(page.locator("#tab-resumo tbody tr")).toHaveCount(1);
  await expect(page.locator("#tab-resumo")).not.toContainText("Ganhos em");
});

test("dois combustíveis: gasto, média e previsão separados para gasolina e etanol", async ({ page }) => {
  // dia 20 do mês: os cinco abastecimentos caem no mesmo mês, seja qual for o dia em que o teste roda
  const [y, mo] = dia(0).split("-").map(Number), base = Date.UTC(y, mo - 1, 20, 15);
  await page.clock.setFixedTime(base);
  const d20 = (n) => new Date(base + n * 864e5).toISOString().slice(0, 10);
  const ab = (d, km, comb, valor, litros) => ({ data: d20(d), tipo: "gasto", cat: "Combustível", comb, cheio: true, valor, litros, km, ts: 100 + d });
  // gasolina faz 12 km/l (480 km com 40 L) e etanol 8 km/l (320 km com 40 L)
  await abrir(page, dados({ lancamentos: [ab(-12, 40000, "Gasolina", 250, 40), ab(-9, 40480, "Etanol", 160, 40), ab(-6, 40800, "Gasolina", 250, 40), ab(-3, 41280, "Etanol", 160, 40), ab(0, 41600, "Gasolina", 250, 40)], carros: [{ id: "principal", tanque: 40 }] })); // tanque de 40 L: cada um esvazia e enche, sem mistura
  const comb = page.locator("#tab-inicio .tile").first();
  await expect(comb).toContainText("Gasolina");
  await expect(comb).toContainText("Etanol");
  await expect(page.locator("#tab-inicio .tile").nth(1)).toContainText("Etanol"); // previsão separada também
  await aba(page, "carro");
  await parte(page, "consumo");
  await expect(page.locator("#tab-carro .metrics")).toContainText("Média com gasolina");
  await expect(page.locator("#tab-carro .metrics")).toContainText("12,0");
  await expect(page.locator("#tab-carro .metrics")).toContainText("Média com etanol");
  await expect(page.locator("#tab-carro .metrics")).toContainText("8,0");
  await expect(page.locator("#tab-carro .metrics")).toContainText("Preço médio do etanol");
  // por km: Σ(litros × preço) ÷ Σ(litros × km/l) = (120×6,25 + 80×4) ÷ (120×12 + 80×8) = R$ 0,51 (pelos litros seria R$ 0,54)
  await expect(page.locator("#tab-carro .metrics div", { hasText: "Combustível por km" })).toContainText("R$ 0,51");
});

test("tanque misturado não dá ao etanol a média da gasolina", async ({ page }) => {
  const ab = (d, km, comb, valor, litros, ts = 100 + d) => ({ data: dia(d), tipo: "gasto", cat: "Combustível", comb, cheio: true, valor, litros, km, ts });
  // como aconteceu com o João: gasolina e etanol no mesmo dia, depois só completou com gasolina
  await abrir(page, dados({ lancamentos: [
    ab(-14, 176140, "Gasolina", 100, 16.4, 1), ab(-14, 176140, "Etanol", 138.77, 33.1, 2),
    ab(-12, 176242, "Gasolina", 47.42, 7.97), ab(-9, 176422, "Gasolina", 118.02, 19.4), ab(0, 176722, "Gasolina", 182, 30),
  ] }));
  await aba(page, "carro");
  await parte(page, "consumo");
  const m = page.locator("#tab-carro .metrics");
  await expect(m).toContainText("confiança baixa"); // três tanques e um deles bem fora: ainda não dá para cravar
  const v = async (c) => Number((await m.locator("div", { hasText: "Média com " + c }).locator(".v").innerText()).split(" ")[0].replace(",", "."));
  expect(await v("etanol")).toBeLessThan(await v("gasolina"));
});

// Carro de verdade: cada litro da mistura rende % de gasolina × média da gasolina + % de etanol × média do etanol.
// Gera os abastecimentos de quem enche o tanque a cada vez, com o que sobrou misturando no que entra.
function abastMisturados({ T = 50, kg = 12, ke = 8.4, ordem, falta = {} }) {
  let mix = { Gasolina: 1, Etanol: 0 }, km = 50000, deve = 0;
  const L = [{ data: dia(-40), tipo: "gasto", cat: "Combustível", comb: "Gasolina", cheio: true, valor: 300, litros: T, km, ts: 1 }];
  ordem.forEach((comb, i) => {
    const queimou = T * (0.6 + 0.05 * (i % 5)), d = Math.round(queimou * (mix.Gasolina * kg + mix.Etanol * ke));
    km += d;
    const lit = queimou + deve - (falta[i] || 0); // falta[i]: marcou "Enchi o tanque", mas faltaram esses litros
    deve = falta[i] || 0;
    const sobra = T - queimou, tot = sobra + lit;
    mix = { Gasolina: (mix.Gasolina * sobra + (comb === "Gasolina" ? lit : 0)) / tot, Etanol: (mix.Etanol * sobra + (comb === "Etanol" ? lit : 0)) / tot };
    L.push({ data: dia(-38 + 3 * i), tipo: "gasto", cat: "Combustível", comb, cheio: true, valor: lit * 5, litros: Math.round(lit * 1000) / 1000, km, ts: 2 + i });
  });
  return L;
}

test("tanques misturados: as duas médias saem da conta com a porcentagem de cada tanque", async ({ page }) => {
  // carro de verdade faz 12 km/l com gasolina e 8,4 com etanol; o motorista nunca roda um tanque puro
  const L = abastMisturados({ ordem: ["Etanol", "Gasolina", "Etanol", "Etanol", "Gasolina", "Etanol", "Gasolina"] });
  await abrir(page, dados({ lancamentos: L, carros: [{ id: "principal", tanque: 50 }] }));
  await aba(page, "carro");
  await parte(page, "consumo");
  const m = page.locator("#tab-carro .metrics");
  await expect(m.locator("div", { hasText: "Média com gasolina" })).toContainText("12,0");
  await expect(m.locator("div", { hasText: "Média com etanol" })).toContainText("8,4");
  await expect(m).toContainText("confiança");
  await expect(m).not.toContainText("confiança baixa");
});

test("tanque marcado como cheio que não encheu: o app junta com o seguinte e avisa a data", async ({ page }) => {
  const L = abastMisturados({ ordem: ["Etanol", "Gasolina", "Etanol", "Etanol", "Gasolina", "Gasolina", "Etanol", "Gasolina", "Etanol"], falta: { 3: 9 } });
  await abrir(page, dados({ lancamentos: L, carros: [{ id: "principal", tanque: 50 }] }));
  await aba(page, "carro");
  await parte(page, "consumo");
  await expect(page.locator("#tab-carro")).toContainText(`O abastecimento de ${dBRcurto(L[4].data)} parece não ter enchido`);
  const m = page.locator("#tab-carro .metrics");
  const v = async (c) => Number((await m.locator("div", { hasText: "Média com " + c }).locator(".v").innerText()).split(" ")[0].replace(",", "."));
  expect(Math.abs((await v("gasolina")) - 12)).toBeLessThan(0.3);
  expect(Math.abs((await v("etanol")) - 8.4)).toBeLessThan(0.3);
});

test("gasolina e etanol na mesma parada contam como um abastecimento só", async ({ page }) => {
  const ab = (d, km, comb, valor, litros, ts) => ({ data: dia(d), tipo: "gasto", cat: "Combustível", comb, cheio: true, valor, litros, km, ts });
  // R$ 60 de gasolina e completou com etanol no mesmo KM: o trecho de 400 km gastou os 40 L, e não só os 10 L da gasolina
  await abrir(page, dados({ lancamentos: [ab(-9, 1000, "Etanol", 200, 50, 1), ab(-6, 1400, "Gasolina", 60, 10, 2), ab(-6, 1400, "Etanol", 120, 30, 3), ab(-3, 1800, "Gasolina", 240, 40, 4)], carros: [{ id: "principal", tanque: 50 }] }));
  await aba(page, "carro");
  await parte(page, "consumo");
  const lista = page.locator("#tab-carro .mlist");
  await expect(lista).toContainText("junto");
  await expect(lista.locator(".fk")).not.toContainText(["40,0"]); // nenhum km/l de 40
  await expect(lista.locator(".frow").filter({ hasText: "Etanol30,0 L" }).locator(".fk")).toContainText("10,0");
});

test("parcial: o combustível que sobrou no tanque entra na mistura pelo KM rodado", async ({ page }) => {
  const ab = (d, km, comb, valor, litros, cheio = true) => ({ data: dia(d), tipo: "gasto", cat: "Combustível", comb, cheio, valor, litros, km, ts: 100 + d });
  // tanque de 50 L cheio de etanol; rodou 252 km (gastou 30 L a 8,4 km/l) e sobraram 20 L.
  // Colocou 10 L de gasolina sem encher: 20 L de etanol + 10 L de gasolina = 67% etanol, e não 80%.
  // Rodou mais 150 km com essa mistura e encheu com gasolina.
  await abrir(page, dados({ lancamentos: [ab(-6, 1000, "Etanol", 210, 50), ab(-4, 1252, "Gasolina", 60, 10, false), ab(-2, 1402, "Gasolina", 214, 35.6)], carros: [{ id: "principal", tanque: 50 }] }));
  await aba(page, "carro");
  await parte(page, "consumo");
  // o trecho rodou 252 km com 100% de etanol e 150 km com 67%: 88% no total (com a conta antiga, 93%)
  await expect(page.locator("#tab-carro .frow").first()).toContainText("rodou com 88% de etanol");
});

test("parcial sem KM: a mistura do trecho fica incerta e não entra na conta de gasolina e etanol", async ({ page }) => {
  const ab = (d, km, comb, valor, litros, cheio = true) => ({ data: dia(d), tipo: "gasto", cat: "Combustível", comb, cheio, valor, litros, km, ts: 100 + d });
  await abrir(page, dados({ lancamentos: [ab(-6, 1000, "Etanol", 210, 50), ab(-4, null, "Gasolina", 60, 10, false), ab(-2, 1402, "Gasolina", 214, 35.6)], carros: [{ id: "principal", tanque: 50 }] }));
  await aba(page, "carro");
  await parte(page, "consumo");
  await expect(page.locator("#tab-carro .frow").first()).toContainText("mistura incerta");
});

test("poucos tanques com os dois combustíveis: avisa quantos faltam e não inventa as médias", async ({ page }) => {
  const ab = (d, km, comb, valor, litros) => ({ data: dia(d), tipo: "gasto", cat: "Combustível", comb, cheio: true, valor, litros, km, ts: 100 + d });
  await abrir(page, dados({ lancamentos: [ab(-9, 1000, "Gasolina", 300, 50), ab(-6, 1300, "Etanol", 150, 30), ab(-3, 1560, "Gasolina", 180, 28)] }));
  await aba(page, "carro");
  await parte(page, "consumo");
  await expect(page.locator("#tab-carro")).toContainText("Falta 1 tanque cheio com KM para separar");
  await expect(page.locator("#tab-carro .metrics")).not.toContainText("Média com etanol");
  await expect(page.locator("#tab-carro .metrics")).toContainText("Média por litro");
  // sem o tamanho do tanque, pede uma vez
  await page.locator("#pedeTanque").click();
  await expect(page.locator("#cT")).toBeVisible();
});

test("com uma janela aberta, a tela de trás não rola, e volta para o mesmo lugar ao fechar", async ({ page }) => {
  const ab = (d) => ({ data: dia(0), tipo: "gasto", cat: "Combustível", comb: "Gasolina", cheio: true, valor: 100, litros: 16, km: 1000 + 100 * (30 + d), ts: 100 + d });
  await abrir(page, dados({ lancamentos: Array.from({ length: 25 }, (_, i) => ab(-i)) }));
  await aba(page, "historico");
  await page.evaluate(() => window.scrollTo(0, 400));
  const antes = await page.evaluate(() => window.scrollY);
  expect(antes).toBeGreaterThan(0);
  await page.locator("#fab").click();
  await expect(page.locator("body")).toHaveClass(/travado/);
  await page.evaluate(() => window.scrollBy(0, 600)); // tentar rolar o fundo (a roda do mouse não existe no iPhone)
  await page.locator("#fCancel").click();
  await expect(page.locator("body")).not.toHaveClass(/travado/);
  expect(await page.evaluate(() => window.scrollY)).toBe(antes);
});

test("KM digitado errado não infla a previsão nem o valor para manter o carro, e vira aviso", async ({ page }) => {
  const ab = (d, km, valor, litros) => ({ data: dia(d), tipo: "gasto", cat: "Combustível", comb: "Gasolina", cheio: true, valor, litros, km, ts: 100 + d });
  // rodou 300 km em 17 dias (17,6 km por dia), mas no meio um KM saiu com 1.800 a menos
  await abrir(page, dados({ lancamentos: [ab(-17, 175840, 200, 33.1), ab(-10, 174040, 120, 20), ab(0, 176140, 150, 25)] }));
  await expect(page.locator("#tab-inicio .alert", { hasText: "Confira um KM" })).toContainText("174.040");
  await aba(page, "carro");
  await expect(page.locator("#tab-carro .odo-ritmo")).toContainText("18 km por dia"); // e não centenas
  await parte(page, "consumo");
  await expect(page.locator("#tab-carro .metrics")).toContainText("6,7"); // 300 km com 45 L, sem o KM errado
});

test("aviso de KM errado diz onde ele está e abre o registro para corrigir", async ({ page }) => {
  const ab = (d, km, valor, litros) => ({ data: dia(d), tipo: "gasto", cat: "Combustível", comb: "Gasolina", cheio: true, valor, litros, km, ts: 100 + d });
  // o KM errado ficou só no histórico do serviço (o lançamento já estava certo)
  await abrir(page, dados({
    lancamentos: [ab(-17, 175840, 200, 33.1), ab(-10, 176040, 120, 20), ab(0, 176140, 150, 25)],
    historico: [{ id: "h1", servico: "Troca das lâmpadas", data: dia(-10), km: 174040, valor: 30, ts: 1 }],
  }));
  const alerta = page.locator("#tab-inicio .alert", { hasText: "Confira um KM" });
  await expect(alerta).toContainText("histórico de Troca das lâmpadas");
  await alerta.click();
  await expect(page.locator("#hK")).toHaveValue("174040");
  await page.locator("#hK").fill("176040");
  await page.locator("#fSave").click();
  await expect(page.locator("#tab-inicio .alert", { hasText: "Confira um KM" })).toHaveCount(0);
});

test("KM errado em Atualizar KM pode ser apagado pelo aviso", async ({ page }) => {
  const ab = (d, km, valor, litros) => ({ data: dia(d), tipo: "gasto", cat: "Combustível", comb: "Gasolina", cheio: true, valor, litros, km, ts: 100 + d });
  await abrir(page, dados({
    lancamentos: [ab(-17, 175840, 200, 33.1), ab(0, 176140, 150, 25)],
    carros: [{ id: "principal", leituras: [{ data: dia(-10), km: 174040 }] }],
  }));
  const alerta = page.locator("#tab-inicio .alert", { hasText: "Confira um KM" });
  await expect(alerta).toContainText("Atualizar KM");
  await alerta.click();
  await page.locator("#fDel").click();
  await page.locator("#fDel").click();
  await expect(page.locator("#tab-inicio .alert", { hasText: "Confira um KM" })).toHaveCount(0);
});

test("ganho por km divide só o ganho dos dias com KM anotado", async ({ page }) => {
  // dia A: 5 h, 100 km e R$ 100; dia B: R$ 100 sem KM. Antes: R$ 200 ÷ 100 km = R$ 2/km.
  const [y, mo] = dia(0).split("-").map(Number), base = Date.UTC(y, mo - 1, 20, 15);
  await page.clock.setFixedTime(base);
  const d20 = (n) => new Date(base + n * 864e5).toISOString().slice(0, 10);
  await abrir(page, dados({
    lancamentos: [{ data: d20(-1), tipo: "ganho", cat: "Uber", trabalho: true, valor: 100, ts: 1 }, { data: d20(0), tipo: "ganho", cat: "Uber", trabalho: true, valor: 100, ts: 2 }],
    dias: [{ data: d20(-1), horas: 5, kmIni: 1000, kmFim: 1100 }],
  }));
  await page.click("#trabMais");
  const q = page.locator("#tab-inicio .metrics").first();
  await expect(q.locator("div", { hasText: /^Ganho por km/ }).first()).toContainText("R$ 1,00");
  await expect(q.locator("div", { hasText: "Lucro por dia" })).toContainText("R$ 100,00"); // 2 dias trabalhados
});

test("km rodados no mês: a virada do mês fica dividida entre os dois meses", async ({ page }) => {
  const [y, mo] = dia(0).split("-").map(Number), base = Date.UTC(y, mo - 1, 10, 15);
  await page.clock.setFixedTime(base);
  const d10 = (n) => new Date(base + n * 864e5).toISOString().slice(0, 10);
  const ab = (d, km) => ({ data: d10(d), tipo: "gasto", cat: "Combustível", comb: "Gasolina", cheio: true, valor: 250, litros: 40, km, ts: 100 + d });
  // 1.000 dois dias antes do dia 1 e 1.500 no dia 4: dos 500 km, 150 foram no mês passado. Depois 2.000 hoje (dia 10).
  await abrir(page, dados({ lancamentos: [ab(-11, 1000), ab(-6, 1500), ab(0, 2000)] }));
  await aba(page, "carro");
  await parte(page, "consumo");
  await expect(page.locator("#tab-carro .metrics div", { hasText: "Rodou em" })).toContainText("850");
});

test("custo por km da manutenção vem da lista de serviços, não de uma troca de pneus no mês", async ({ page }) => {
  await abrir(page, dados({
    manutencao: [{ servico: "Troca de óleo", custo: 300, cadaKm: 10000 }],
    lancamentos: [{ data: dia(-5), tipo: "gasto", cat: "Peças / pneus", valor: 1000, km: 40500, ts: 1 }, { data: dia(-20), tipo: "gasto", cat: "Combustível", comb: "Gasolina", cheio: true, valor: 250, litros: 40, km: 40000, ts: 2 }],
  }));
  await aba(page, "carro");
  await parte(page, "custos");
  await expect(page.locator(".bar-row", { hasText: "Manutenção, pneus e lavagem" })).toContainText("R$ 0,03/km"); // R$ 300 ÷ 10.000 km
});
