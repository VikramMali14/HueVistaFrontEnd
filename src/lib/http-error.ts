/**
 * Shared HTTP error type. Lives in its own module so both the API client
 * (src/lib/api.ts) and the offline demo handlers (src/lib/demo/*) can throw the
 * SAME class without an import cycle. `err instanceof HttpError` then works in
 * every caller (auth actions, client components) regardless of who threw it.
 */
export class HttpError extends Error {
  status: number;
  fieldErrors?: Record<string, string>;
  /** Backend machine-readable hint, e.g. "VERIFICATION_REQUIRED" / "SUBSCRIPTION_REQUIRED". */
  code?: string;
  constructor(status: number, message: string, fieldErrors?: Record<string, string>, code?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.code = code;
  }
}
