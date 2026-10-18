/* Configurações do RLCAR publicado.
   Para mudar: abra este arquivo no GitHub, toque no lápis (Edit), troque o valor e toque em "Commit changes".
   O robô publica a versão nova sozinho em 1 ou 2 minutos. */
window.CAIXA_CONFIG = {
  // Sentry (avisa você quando o app der erro no celular de alguém).
  // Cole aqui, entre as aspas, o DSN do seu projeto no Sentry: Settings > Projects > (seu projeto) > Client Keys (DSN).
  // Ele começa com https:// e termina com um número, por exemplo: "https://abc123@o456.ingest.us.sentry.io/789"
  // Em branco, o Sentry fica desligado.
  sentryDsn: "https://1a4bd5fe177900fbb4cbde862ab165b7@o4512274777047040.ingest.us.sentry.io/4512274805227520",

  // Google Drive (cada motorista guarda a cópia de segurança no Drive dele, entrando com a conta Google).
  // Cole aqui o "ID do cliente" do Google Cloud. Ele termina em .apps.googleusercontent.com e não é segredo.
  // Em branco, os botões do Google ficam escondidos e só vale a cópia em arquivo.
  googleClientId: "249858698384-omg0nidkv0m7s22okp6bltplhlu2ehqc.apps.googleusercontent.com",
};
