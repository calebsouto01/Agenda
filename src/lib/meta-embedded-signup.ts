/** Embedded Signup da Meta (WhatsApp Cloud API): popup do Facebook que devolve o número escolhido. */

const META_APP_ID = import.meta.env["VITE_META_APP_ID"] as string | undefined;
const META_CONFIG_ID = import.meta.env["VITE_META_CONFIG_ID"] as string | undefined;

export const embeddedSignupConfigured = Boolean(META_APP_ID && META_CONFIG_ID);

type FbSdk = {
  init: (opts: Record<string, unknown>) => void;
  login: (
    cb: (res: { authResponse?: { code?: string } | null }) => void,
    opts: Record<string, unknown>,
  ) => void;
};

declare global {
  interface Window {
    FB?: FbSdk;
    fbAsyncInit?: () => void;
  }
}

let sdkPromise: Promise<FbSdk> | null = null;

function loadSdk(): Promise<FbSdk> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const ready = () => {
      window.FB!.init({
        appId: META_APP_ID,
        autoLogAppEvents: true,
        xfbml: false,
        version: "v21.0",
      });
      resolve(window.FB!);
    };
    if (window.FB) return ready();
    window.fbAsyncInit = ready;
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.async = true;
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error("Não foi possível carregar o SDK da Meta"));
    };
    document.body.appendChild(s);
  });
  return sdkPromise;
}

export type EmbeddedSignupResult = { code: string; wabaId: string; phoneNumberId: string };

/** Abre o popup e resolve quando o cliente conclui o cadastro; rejeita se cancelar. */
export async function runEmbeddedSignup(): Promise<EmbeddedSignupResult> {
  const FB = await loadSdk();
  return new Promise((resolve, reject) => {
    let code: string | null = null;
    let session: { wabaId: string; phoneNumberId: string } | null = null;
    let done = false;

    const finish = () => {
      if (done || !code || !session) return;
      done = true;
      window.removeEventListener("message", onMessage);
      resolve({ code, ...session });
    };

    const onMessage = (event: MessageEvent) => {
      if (!/^https:\/\/(www|web)\.facebook\.com$/.test(event.origin)) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
          if (data.data?.phone_number_id && data.data?.waba_id) {
            session = { wabaId: data.data.waba_id, phoneNumberId: data.data.phone_number_id };
            finish();
          }
        } else if (data.event === "CANCEL" && !done) {
          done = true;
          window.removeEventListener("message", onMessage);
          reject(new Error("cancelled"));
        }
      } catch {
        /* mensagem que não é JSON */
      }
    };
    window.addEventListener("message", onMessage);

    FB.login(
      (res) => {
        if (res.authResponse?.code) {
          code = res.authResponse.code;
          finish();
        } else if (!done) {
          done = true;
          window.removeEventListener("message", onMessage);
          reject(new Error("cancelled"));
        }
      },
      {
        config_id: META_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      },
    );
  });
}
