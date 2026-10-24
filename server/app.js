// The Express app (no listen, no scheduler): imported by index.js and by scripts/route-test.js.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import apiRouter from './routes/index.js';
import { codeForStatus, sendError } from './lib/errors.js';

const isProd = process.env.NODE_ENV === 'production';

const allowedOrigins = (process.env.CLIENT_URL ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);
const localhostOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export const app = express();

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser requests (curl, bridge) with no Origin header.
      if (!origin || allowedOrigins.includes(origin) || localhostOrigin.test(origin)) {
        return callback(null, true);
      }
      callback(null, false);
    },
  })
);
// Skip the bridge's 1 s command poll in logs.
app.use(morgan('dev', { skip: (req, res) => req.originalUrl.startsWith('/api/device/commands') && res.statusCode < 400 }));
app.use(express.json({ limit: '100kb' }));

app.use('/api', apiRouter);

app.use('/api', (req, res) => sendError(res, 404, 'not_found', 'Not found'));

// Central error handler (Express 5 forwards rejected async handlers here).
// Shape: { error: { code, message, details? } }. Only errors marked `expose` (HttpError, AI errors,
// body-parser 4xx) show their message; everything else is generic in production.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  let status = Number(err.status || err.statusCode) || 500;
  if (status < 400 || status > 599) status = 500;

  let message;
  if (err.type === 'entity.parse.failed') message = 'Request body is not valid JSON';
  else if (err.expose) message = err.message;
  else message = status >= 500 ? 'Internal server error' : 'Bad request';

  const code = err.expose && typeof err.code === 'string' && !/^\d/.test(err.code) ? err.code : codeForStatus(status);
  if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}:`, err);

  let details = err.details;
  if (!isProd && status >= 500 && !err.expose) details = { message: err.message };
  sendError(res, status, code, message, details);
});
