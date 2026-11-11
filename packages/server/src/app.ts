import type { IncomingMessage, ServerResponse } from 'node:http';
import { FamilyShieldError } from '@familyshield/core';
import type { CreateRequestInput, LenderResponse } from '@familyshield/core';
import { CsvDataError } from '@familyshield/service';
import type { FamilyShieldService } from '@familyshield/service';

/**
 * The HTTP API from docs/API.md, on Node's built-in http module.
 *
 * Authentication (functional mockup only): `Authorization: Bearer <user id>`,
 * where the id is a row in data/people.csv. A real deployment swaps this for
 * short-lived tokens minted by the bank (docs/INTEGRATION.md).
 */

type Handler = (ctx: Ctx) => unknown;

interface Ctx {
  params: Record<string, string>;
  body: Record<string, unknown>;
  /** The signed-in user; throws 401 if missing. */
  user(): string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const STATUS: Record<string, number> = {
  INVALID_INPUT: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  LIMIT_REACHED: 409,
};

export function createApp(service: FamilyShieldService, options: { allowOrigin?: string } = {}) {
  const routes: Array<{ method: string; pattern: RegExp; keys: string[]; handler: Handler }> = [];
  const route = (method: string, path: string, handler: Handler) => {
    const keys: string[] = [];
    const pattern = new RegExp(
      '^' +
        path.replace(/:([a-zA-Z]+)/g, (_, k: string) => {
          keys.push(k);
          return '([^/]+)';
        }) +
        '/?$',
    );
    routes.push({ method, pattern, keys, handler });
  };

  const str = (v: unknown, name: string) => {
    if (typeof v !== 'string') throw new HttpError(400, 'INVALID_INPUT', `"${name}" must be text.`);
    return v;
  };
  const numb = (v: unknown, name: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new HttpError(400, 'INVALID_INPUT', `"${name}" must be a number.`);
    return v;
  };
  const boolean = (v: unknown, name: string) => {
    if (typeof v !== 'boolean') throw new HttpError(400, 'INVALID_INPUT', `"${name}" must be true or false.`);
    return v;
  };

  // ---- reads
  route('GET', '/v1/health', () => ({ ok: true }));
  route('GET', '/v1/config', () => service.config());
  route('GET', '/v1/me', (c) => service.profile(c.user()));
  route('GET', '/v1/me/loan', (c) => service.myLoan(c.user()));
  route('GET', '/v1/me/incoming', (c) => service.incoming(c.user()));

  // ---- trusted circle (the caller's own)
  const nickname = (v: unknown) => (v === undefined || v === null ? undefined : str(v, 'nickname'));
  route('GET', '/v1/me/circle', (c) => service.circle(c.user()));
  route('POST', '/v1/me/circle', (c) =>
    service.addCircleMemberByContact(c.user(), str(c.body.contact, 'contact'), {
      nickname: nickname(c.body.nickname),
      name: typeof c.body.name === 'string' ? c.body.name : undefined,
    }),
  );
  route('POST', '/v1/me/circle/:memberId/nickname', (c) =>
    service.renameCircleMember(c.user(), c.params.memberId!, nickname(c.body.nickname) ?? ''),
  );
  route('POST', '/v1/me/circle/:memberId/remove', (c) => service.removeCircleMember(c.user(), c.params.memberId!));

  // ---- borrower
  route('POST', '/v1/loans', (c) => {
    const input: CreateRequestInput = {
      reason: str(c.body.reason, 'reason') as CreateRequestInput['reason'],
      purpose: str(c.body.purpose, 'purpose'),
      amount: numb(c.body.amount, 'amount'),
      months: numb(c.body.months, 'months'),
    };
    return service.createRequest(c.user(), input);
  });
  route('POST', '/v1/loans/:id/cancel', (c) => service.cancelRequest(c.user(), c.params.id!));
  route('POST', '/v1/loans/:id/offers/:memberId/acceptance', (c) =>
    service.setOfferAccepted(c.user(), c.params.id!, c.params.memberId!, boolean(c.body.accepted, 'accepted')),
  );
  route('POST', '/v1/loans/:id/sign', (c) => service.signAsBorrower(c.user(), c.params.id!));
  route('POST', '/v1/loans/:id/payments', (c) => service.makePayment(c.user(), c.params.id!));
  route('POST', '/v1/loans/:id/pause', (c) => service.requestPause(c.user(), c.params.id!));
  route('POST', '/v1/loans/:id/pause/cancel', (c) => service.cancelPause(c.user(), c.params.id!));
  route('POST', '/v1/loans/:id/rewards/:rewardId/claim', (c) => service.claimReward(c.user(), c.params.id!, c.params.rewardId!));

  // ---- lender
  route('POST', '/v1/loans/:id/responses', (c) => {
    const kind = str(c.body.kind, 'kind');
    const note = c.body.note === undefined ? undefined : str(c.body.note, 'note');
    const response: LenderResponse =
      kind === 'offer' ? { kind: 'offer', amount: numb(c.body.amount, 'amount'), note } : { kind: 'decline', note };
    return service.respond(c.user(), c.params.id!, response);
  });
  route('POST', '/v1/loans/:id/lender-signature', (c) => service.signAsLender(c.user(), c.params.id!));
  route('POST', '/v1/loans/:id/pause/responses', (c) => service.respondToPause(c.user(), c.params.id!, boolean(c.body.approve, 'approve')));

  // ---- functional mockup helpers (not part of the production API)
  route('GET', '/v1/mockup/people', () => service.people());
  route('GET', '/v1/mockup/accounts/:userId', (c) => service.account(c.params.userId!));
  route('POST', '/v1/mockup/reset', () => {
    service.reset();
    return null;
  });

  const allowOrigin = options.allowOrigin ?? '*';

  async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > 100_000) throw new HttpError(413, 'INVALID_INPUT', 'Request body too large.');
      chunks.push(chunk as Buffer);
    }
    if (chunks.length === 0) return {};
    try {
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      throw new HttpError(400, 'INVALID_INPUT', 'Body must be JSON.');
    }
  }

  function send(res: ServerResponse, status: number, data: unknown) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': allowOrigin,
      'Cache-Control': 'no-store',
    });
    res.end(status === 204 ? undefined : JSON.stringify(data));
  }

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
        'Access-Control-Max-Age': '600',
      });
      res.end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.pattern.exec(url.pathname);
        if (!m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
        const body = req.method === 'POST' ? await readBody(req) : {};
        const ctx: Ctx = {
          params,
          body,
          user() {
            const auth = req.headers.authorization ?? '';
            const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim();
            if (!token) throw new HttpError(401, 'FORBIDDEN', 'Sign in first: send "Authorization: Bearer <user id from people.csv>".');
            return token;
          },
        };
        const result = await r.handler(ctx);
        send(res, result === null && r.method === 'POST' && url.pathname.endsWith('/reset') ? 204 : 200, result);
        return;
      }
      throw new HttpError(404, 'NOT_FOUND', `No route for ${req.method} ${url.pathname}`);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: { code: e.code, message: e.message } });
      if (e instanceof FamilyShieldError) return send(res, STATUS[e.code] ?? 400, { error: { code: e.code, message: e.message } });
      if (e instanceof CsvDataError) {
        console.error(`[data] ${e.message}`);
        return send(res, 500, { error: { code: 'DATA_ERROR', message: `There’s a problem in the data files. ${e.message}` } });
      }
      console.error(e);
      return send(res, 500, { error: { code: 'INTERNAL', message: 'Something went wrong on the server.' } });
    }
  };
}
