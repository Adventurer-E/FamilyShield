/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend server, e.g. "/v1". Unset = browser mode. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
