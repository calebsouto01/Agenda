import type { CapacitorConfig } from "@capacitor/core";

// App nativo (Android/iOS) que carrega o site já publicado da Zaka dentro de
// uma WebView, liberando plugins nativos (ex.: leitura de contatos) que um
// site puro não consegue acessar. appId não pode mudar depois de publicado
// na Play Store — ajuste antes do primeiro build de produção se necessário.
const config: CapacitorConfig = {
  appId: "com.zaka.app",
  appName: "Zaka",
  webDir: "www",
  server: {
    // Abre direto no painel do dono do estabelecimento (não na home de
    // marketing) — /admin redireciona pro login quando não há sessão.
    url: "https://agendazaka.com/admin",
    cleartext: false,
  },
};

export default config;
