/**
 * Entry point of the production embed page (index.html → dist/embed/).
 *
 * The host sends an init message whose `session` is:
 *   { apiBaseUrl: "https://api.familyshield.example/v1", token: "<short-lived token>" }
 * See docs/INTEGRATION.md for the full handshake.
 */
import { HttpApi } from './api/http';
import { bootEmbed } from './embed';

const allowed = (import.meta.env.VITE_ALLOWED_HOST_ORIGINS ?? '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean);

bootEmbed({
  allowedHostOrigins: allowed,
  createApi: (session) => {
    const apiBaseUrl = session.apiBaseUrl;
    const token = session.token;
    if (typeof apiBaseUrl !== 'string' || typeof token !== 'string') {
      throw new Error('Init message is missing session.apiBaseUrl or session.token');
    }
    return new HttpApi({ baseUrl: apiBaseUrl, getToken: () => token });
  },
});
