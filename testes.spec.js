// Testes automáticos do Caixa do Motorista.
// Cada teste abre o app num celular simulado (Android e iPhone), usa como um motorista usaria e confere os números.
// A Tabela FIPE e a ANP são simuladas aqui, para o teste não depender da internet nem do preço da semana.
const fs = require("fs");
const { test, expect } = require("@playwright/test");

const CHAVE = "caixa-motorista:dados:v1"; // onde o app guarda os dados no celular (local.js)
const BASE = "data/users/local/app";
const FUSO = "America/Sao_Paulo";

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
  const loja = { [BASE]: { servicosPadrao: true, ...ajustes } };
  for (const [nome, docs] of Object.entries(colecoes)) {
    docs.forEach((d, i) => { const { id = nome + i, ...resto } = d; loja[`${BASE}/${nome}/${id}`] = resto; });
  }
  return loja;
}
async function abrir(page, loja) {
  if (loja) {
    // grava só na primeira abertura da aba; depois de recarregar, valem os dados que o app salvou
    await page.addInitScript(([k, v]) => {
      if (!sessionStorage.getItem("semeado")) { localStorage.setItem(k, v); sessionStorage.setItem("semeado", "1"); }
    }, [CHAVE, JSON.stringify(loja)]);
  }
  await page.goto("./");
  await expect(page.locator("#tab-inicio .lucro")).not.toHaveText("…");
}
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
  await expect(page).toHaveTitle(/Caixa do Motorista/);
  const manifesto = await (await request.get(await page.locator('link[rel="manifest"]').getAttribute("href"))).json();
  expect(manifesto.name).toBe("Caixa do Motorista");
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

test("celular novo ou formatado: a cópia vai pelo menu de compartilhar e volta pela primeira tela", async ({ page }) => {
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
  expect(enviado.nome).toMatch(/^caixa-motorista-copia-.*\.txt$/);
  expect(JSON.parse(enviado.texto).colecoes.lancamentos).toHaveLength(1);
  await aba(page, "inicio");
  await expect(page.locator(".alerts")).toHaveCount(0);
  // formatou: o app abre vazio e oferece restaurar logo na primeira tela
  await page.evaluate((k) => localStorage.removeItem(k), CHAVE);
  await page.reload();
  await expect(page.locator("#restIni")).toBeVisible();
  await page.click("#bkLoadIni");
  await page.setInputFiles("#bkIn", { name: enviado.nome, mimeType: "text/plain", buffer: Buffer.from(enviado.texto) });
  await expect(page.locator("#bkMsg")).toContainText("1 registro");
  await page.click("#fSave");
  await page.click("#fSave");
  await expect(page.locator("#sheet")).toBeHidden();
  await expect(page.locator(".lucro")).toContainText("300,00");
  await expect(page.locator("#restIni")).toHaveCount(0);
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
