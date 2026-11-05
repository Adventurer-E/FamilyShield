export type FamilyShieldErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_STATE'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'LIMIT_REACHED';

/** Thrown for any rule violation. `message` is safe to show to the user. */
export class FamilyShieldError extends Error {
  readonly code: FamilyShieldErrorCode;

  constructor(code: FamilyShieldErrorCode, message: string) {
    super(message);
    this.name = 'FamilyShieldError';
    this.code = code;
  }
}

export function invariant(condition: unknown, code: FamilyShieldErrorCode, message: string): asserts condition {
  if (!condition) throw new FamilyShieldError(code, message);
}
