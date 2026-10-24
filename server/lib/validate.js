import { z } from 'zod';
import { HttpError } from './errors.js';

// validate({ body, query, params }) — parses each part with its zod schema and puts the
// results on req.valid.{body,query,params} (Express 5's req.query is read-only).
// Unknown fields are stripped (zod's default for z.object).
export function validate(schemas) {
  return (req, res, next) => {
    req.valid ??= {};
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (!result.success) {
        return next(
          new HttpError(400, `Invalid request ${part}`, {
            details: result.error.issues.map((i) => ({ path: [part, ...i.path].join('.'), message: i.message })),
          })
        );
      }
      req.valid[part] = result.data;
    }
    next();
  };
}

export { z };
