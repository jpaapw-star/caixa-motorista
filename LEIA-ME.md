# Caixa do Motorista

App grátis para motorista de aplicativo: ganhos, gastos, combustível, manutenção e caixinha do carro.
Fica no GitHub Pages (de graça) e se instala no celular pela tela inicial. Os dados de cada pessoa ficam só no celular dela.

## O que tem aqui

| Arquivo | Para que serve |
|---|---|
| `app.html` | o app (telas e contas) |
| `local.js` | guarda os dados no celular |
| `config.js` | configurações; é aqui que entra o DSN do Sentry |
| `qrcode.js` | desenha o QR code do "Indicar para um motorista" |
| `sw.template.js` | faz o app abrir sem internet |
| `build.py` | monta o app para publicar |
| `anp.py` | robô que baixa o preço médio dos combustíveis da ANP |
| `testes.spec.js`, `playwright.config.js`, `package.json` | testes automáticos |
| `publicar.yml` | o robô do GitHub: testa, atualiza a ANP e publica |
| `icon-*.png`, `apple-touch-icon.png` | ícones |

## Primeira vez

1. **Crie o repositório.** No GitHub, toque em **+ → New repository**. Nome: `caixa-motorista`, deixe **Public** e toque em **Create repository**.
2. **Ligue o GitHub Pages pelo robô.** No repositório: **Settings → Pages**. Em **Source**, escolha **GitHub Actions**.
3. **Envie os arquivos.** Na página do repositório, toque em **uploading an existing file** (ou **Add file → Upload files**). Escolha todos os arquivos desta pasta e toque em **Commit changes**.
   No iPhone, use o Safari em "Solicitar Site para Computador" (botão "aA" na barra de endereço).
4. **Coloque o robô no lugar certo.** Abra o arquivo `publicar.yml` no GitHub, toque no lápis (**Edit**) e troque o nome do arquivo, lá em cima, por:
   `.github/workflows/publicar.yml`
   Ao digitar cada `/`, o GitHub cria a pasta. Toque em **Commit changes**.
5. **Espere o robô.** Na aba **Actions** aparece "Testar e publicar". Em 3 a 5 minutos ele termina, e o endereço do app aparece em **Settings → Pages**. Exemplo: `https://seunome.github.io/caixa-motorista/`
6. **Instale no celular.** No iPhone, abra o endereço no Safari, toque em **Compartilhar → Adicionar à Tela de Início**. No Android, use o Chrome, menu ⋮ e depois **Instalar app**.

Se a primeira rodada do robô falhar porque o Pages ainda não estava ligado, faça o passo 2 e, em **Actions**, abra a rodada e toque em **Re-run all jobs**.

Já tinha enviado o pacote antigo (com `index.html` e `sw.js`)? Pode apagar `index.html`, `sw.js`, `manifest.webmanifest` e `LEIA-ME.txt` do repositório, e troque a fonte do Pages para **GitHub Actions** (passo 2).

## O que o robô faz sozinho

- **Toda vez que você muda um arquivo:** monta o app, roda os testes num Android e num iPhone simulados e, se o teste do Android passar, publica.
  Por enquanto, o teste do iPhone só avisa por e-mail se falhar, sem segurar a publicação. Depois que ele passar algumas vezes, dá para fazer ele segurar também: veja o comentário no fim de `publicar.yml`.
- **Toda proposta de mudança (pull request):** roda os mesmos testes, sem publicar. Assim você vê se está tudo certo antes de tocar em **Merge**.
- **Toda terça à noite e quinta de manhã:** baixa a pesquisa semanal de preços da ANP, grava em `dados/anp.json`, testa e publica.
- **Se algo der errado:** o GitHub manda um e-mail. Em **Actions**, abra a rodada vermelha para ver qual teste falhou.
- **O GitHub pausa as tarefas agendadas** se o repositório ficar 60 dias sem nenhuma mudança. Para religar: **Actions → Testar e publicar → Enable workflow**.

## As novidades no app

- **Preço médio da ANP:** em **Carro → Consumo**, toque em **Escolher cidade**. O app mostra a média da sua cidade (ou do estado, se a cidade não estiver na pesquisa), se o preço subiu ou caiu na semana e quanto você pagou acima ou abaixo da média. Ao anotar um abastecimento, ele também avisa.
- **Tabela FIPE:** em **Carro → Custos**, toque em **Buscar valor na FIPE** e escolha a marca, o modelo e o ano. O valor do carro e a desvalorização passam a vir da FIPE: quanto esse modelo perdeu em 12 meses. Todo mês, o app atualiza sozinho ao abrir com internet. A consulta é feita na BrasilAPI.
- **Indicar para um motorista:** em **Resumo**, o QR code com o link do app e o botão **Mandar o link**.

## Sentry (avisos de erro)

1. Crie uma conta grátis em https://sentry.io e um projeto do tipo **Browser JavaScript**.
2. Copie o **DSN** em **Settings → Projects → (seu projeto) → Client Keys (DSN)**. Ele começa com `https://` e termina com um número.
3. No GitHub, abra `config.js`, toque no lápis e cole o DSN entre as aspas de `sentryDsn: ""`. Toque em **Commit changes**.

Pronto: quando o app der erro no celular de alguém, o Sentry manda os detalhes para você. Ele recebe só o erro (tela, navegador, versão), nunca os valores que a pessoa anotou.

## Rodar os testes no computador (opcional)

```
python build.py
npm install
npx playwright install
npx playwright test
```

Fontes de dados: ANP, Levantamento de Preços de Combustíveis (dados públicos); Tabela FIPE pela BrasilAPI.
`qrcode.js`: biblioteca qrcode-generator, de Kazuhiko Arase (licença MIT).
