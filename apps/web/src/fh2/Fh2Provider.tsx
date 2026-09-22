import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

import {
  readFh2StandaloneConfig,
  validateFh2StandaloneConfig,
  type Fh2StandaloneConfig
} from "./config.js";

export type Fh2RuntimeState =
  | "disabled"
  | "loading"
  | "ready"
  | "error";

export interface Fh2ContextValue {
  config: Fh2StandaloneConfig;
  state: Fh2RuntimeState;
  error: string | null;
}

const Fh2Context = createContext<Fh2ContextValue | undefined>(undefined);

let runtimePromise: Promise<void> | undefined;
let initializedKey = "";

function runtimeConfigKey(config: Fh2StandaloneConfig): string {
  return JSON.stringify([
    config.serverUrl,
    config.wssUrl,
    config.hostUrl,
    config.projectId,
    config.projectToken
  ]);
}

function loadFh2Runtime(paasUrl: string): Promise<void> {
  if (window.FH2) return Promise.resolve();
  if (runtimePromise) return runtimePromise;

  runtimePromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-fh2-runtime="true"]'
    );

    const onReady = () => {
      if (!window.FH2) {
        reject(new Error("paas.js geladen, aber window.FH2 fehlt"));
        return;
      }
      resolve();
    };

    if (existing) {
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("FlightHub-2-Runtime konnte nicht geladen werden")),
        { once: true }
      );
      if (window.FH2) resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = paasUrl;
    script.async = true;
    script.setAttribute("fh2", "");
    script.dataset.fh2Runtime = "true";
    script.addEventListener("load", onReady, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error(`paas.js nicht erreichbar: ${paasUrl}`)),
      { once: true }
    );
    document.head.appendChild(script);
  });

  return runtimePromise;
}

export function Fh2Provider({ children }: { children: ReactNode }) {
  const config = useMemo(() => readFh2StandaloneConfig(), []);
  const [state, setState] = useState<Fh2RuntimeState>(
    config.enabled ? "loading" : "disabled"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config.enabled) {
      setState("disabled");
      return;
    }

    const missing = validateFh2StandaloneConfig(config);
    if (missing.length > 0) {
      setError(`Fehlende FH2-Konfiguration: ${missing.join(", ")}`);
      setState("error");
      return;
    }

    let cancelled = false;

    void loadFh2Runtime(config.paasUrl)
      .then(async () => {
        const key = runtimeConfigKey(config);

        if (initializedKey !== key) {
          if (window.FH2.validateToken) {
            const valid = await window.FH2.validateToken(config.projectToken);
            if (valid === false) {
              throw new Error("FlightHub-2-projectToken wurde abgelehnt");
            }
          }

          window.FH2.initConfig({
            serverUrl: config.serverUrl,
            wssUrl: config.wssUrl,
            hostUrl: config.hostUrl,
            prjId: config.projectId,
            projectToken: config.projectToken
          });
          initializedKey = key;
        }

        if (!cancelled) {
          setError(null);
          setState("ready");
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [config]);

  return (
    <Fh2Context.Provider value={{ config, state, error }}>
      {children}
    </Fh2Context.Provider>
  );
}

export function useFh2(): Fh2ContextValue {
  const value = useContext(Fh2Context);
  if (!value) {
    throw new Error("useFh2 muss innerhalb von Fh2Provider verwendet werden");
  }
  return value;
}
