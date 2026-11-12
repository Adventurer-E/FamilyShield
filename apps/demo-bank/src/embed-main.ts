import { bootEmbed } from '@familyshield/sdk/embed';
import { host } from './host';

/**
 * The embed page as the mockup serves it (the "WebView" mode).
 * It uses the same data as the bank page: the backend server in server mode,
 * or this browser's CSVs in browser mode. In production this page lives on
 * FamilyShield's own domain and builds an HttpApi from the session token
 * (see packages/sdk/src/embed-main.ts).
 */
bootEmbed({
  allowedHostOrigins: [window.location.origin],
  createApi: (session) => host.apiFor(String(session.userId)),
});
