import { FamilyShieldError } from '@familyshield/core';
import type { FamilyShieldErrorCode, LenderResponse, LoanCase } from '@familyshield/core';
import type { CreateRequestInput, FamilyShieldApi, Profile } from './types';

export interface HttpApiOptions {
  /** e.g. "https://api.familyshield.example/v1" */
  baseUrl: string;
  /**
   * Returns a short-lived token the host bank minted for the signed-in
   * customer (see docs/INTEGRATION.md, "Authentication"). Called before
   * every request so the host can refresh it.
   */
  getToken: () => Promise<string> | string;
  /** How often to check for changes when no push channel is available. */
  pollIntervalMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Production adapter. Endpoints are documented in docs/API.md. Errors come
 * back as `{ "error": { "code": "...", "message": "..." } }` and are rethrown
 * as FamilyShieldError so the UI shows the same messages as the mock.
 */
export class HttpApi implements FamilyShieldApi {
  private readonly options: Required<Omit<HttpApiOptions, 'fetchImpl'>> & { fetchImpl: typeof fetch };
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(options: HttpApiOptions) {
    this.options = {
      pollIntervalMs: 5_000,
      fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      ...options,
      baseUrl: options.baseUrl.replace(/\/$/, ''),
    };
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const token = await this.options.getToken();
    const res = await this.options.fetchImpl(`${this.options.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let code: FamilyShieldErrorCode = 'INVALID_STATE';
      let message = 'Something went wrong. Please try again.';
      try {
        const data = (await res.json()) as { error?: { code?: FamilyShieldErrorCode; message?: string } };
        code = data.error?.code ?? code;
        message = data.error?.message ?? message;
      } catch {
        /* non-JSON error body */
      }
      throw new FamilyShieldError(code, message);
    }
    const result = res.status === 204 ? (undefined as T) : ((await res.json()) as T);
    if (method === 'POST') this.notify();
    return result;
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  getProfile() {
    return this.call<Profile>('GET', '/me');
  }
  getMyLoan() {
    return this.call<LoanCase | null>('GET', '/me/loan');
  }
  getIncoming() {
    return this.call<LoanCase[]>('GET', '/me/incoming');
  }
  createRequest(input: CreateRequestInput) {
    return this.call<LoanCase>('POST', '/loans', input);
  }
  cancelRequest(loanId: string) {
    return this.call<LoanCase>('POST', `/loans/${encodeURIComponent(loanId)}/cancel`);
  }
  setOfferAccepted(loanId: string, memberId: string, accepted: boolean) {
    return this.call<LoanCase>('POST', `/loans/${encodeURIComponent(loanId)}/offers/${encodeURIComponent(memberId)}/acceptance`, { accepted });
  }
  signAsBorrower(loanId: string) {
    return this.call<LoanCase>('POST', `/loans/${encodeURIComponent(loanId)}/sign`);
  }
  makePayment(loanId: string) {
    return this.call<LoanCase>('POST', `/loans/${encodeURIComponent(loanId)}/payments`);
  }
  requestPause(loanId: string) {
    return this.call<LoanCase>('POST', `/loans/${encodeURIComponent(loanId)}/pause`);
  }
  cancelPause(loanId: string) {
    return this.call<LoanCase>('POST', `/loans/${encodeURIComponent(loanId)}/pause/cancel`);
  }
  claimReward(loanId: string, rewardId: string) {
    return this.call<LoanCase>('POST', `/loans/${encodeURIComponent(loanId)}/rewards/${encodeURIComponent(rewardId)}/claim`);
  }
  respond(loanId: string, response: LenderResponse) {
    return this.call<LoanCase>('POST', `/loans/${encodeURIComponent(loanId)}/responses`, response);
  }
  signAsLender(loanId: string) {
    return this.call<LoanCase>('POST', `/loans/${encodeURIComponent(loanId)}/lender-signature`);
  }
  respondToPause(loanId: string, approve: boolean) {
    return this.call<LoanCase>('POST', `/loans/${encodeURIComponent(loanId)}/pause/responses`, { approve });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (!this.timer) this.timer = setInterval(() => this.notify(), this.options.pollIntervalMs);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    };
  }
}
