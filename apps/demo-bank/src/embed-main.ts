import { bootEmbed } from '@familyshield/sdk/embed';
import { backend } from './backend';

/**
 * The embed page as the demo serves it. In production this page lives on
 * FamilyShield's own domain and builds an HttpApi from the session token
 * (see packages/sdk/src/embed-main.ts); here it uses the shared mock.
 */
bootEmbed({
  allowedHostOrigins: [window.location.origin],
  createApi: (session) => backend.apiFor(String(session.userId)),
});
