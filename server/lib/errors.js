// Every error response is `{ error: { code, message, details? } }` (API.md).
const CODE_BY_STATUS = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'bad_request',
  429: 'rate_limited',
  502: 'ai_failed',
  503: 'ai_unavailable',
};

export const codeForStatus = (status) => CODE_BY_STATUS[status] ?? (status >= 500 ? 'internal' : 'bad_request');

export class HttpError extends Error {
  constructor(status, message, { code, details, cause } = {}) {
    super(message, { cause });
    this.status = status;
    this.code = code ?? codeForStatus(status);
    this.details = details;
    this.expose = true; // message is safe to show clients
  }
}

export const badRequest = (message, details) => new HttpError(400, message, { details });
export const notFound = (message = 'Not found') => new HttpError(404, message);
export const forbidden = (message = 'Only the owner can do that') => new HttpError(403, message);
export const conflict = (message) => new HttpError(409, message);

export function sendError(res, status, code, message, details) {
  res.status(status).json({ error: { code, message, ...(details !== undefined && { details }) } });
}

// Unwraps a supabase-js result, throwing on error (→ 500 via the central handler).
export function must({ data, error }) {
  if (error) throw Object.assign(new Error(`db: ${error.message}`), { db: error });
  return data;
}
