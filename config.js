/* Configurações do RLCAR publicado.
   Para mudar: abra este arquivo no GitHub, toque no lápis (Edit), troque o valor e toque em "Commit changes".
   O robô publica a versão nova sozinho em 1 ou 2 minutos. */
window.CAIXA_CONFIG = {
  // Sentry (avisa você quando o app der erro no celular de alguém).
  // Cole aqui, entre as aspas, o DSN do seu projeto no Sentry: Settings > Projects > (seu projeto) > Client Keys (DSN).
  // Ele começa com https:// e termina com um número, por exemplo: "https://abc123@o456.ingest.us.sentry.io/789"
  // Em branco, o Sentry fica desligado.
  sentryDsn: "",

  // Google Drive (cada motorista guarda a cópia de segurança no Drive dele, entrando com a conta Google).
  // Cole aqui o "ID do cliente" do Google Cloud. Ele termina em .apps.googleusercontent.com e não é segredo.
  // Em branco, os botões do Google ficam escondidos e só vale a cópia em arquivo.
  googleClientId: "",
};
