/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Comma-separated origins allowed to host the embed page in an iframe. */
  readonly VITE_ALLOWED_HOST_ORIGINS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
