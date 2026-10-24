import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import apiRouter from './routes/index.js';

const isProd = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3001;

const allowedOrigins = (process.env.CLIENT_URL ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);
const localhostOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser requests (curl, server-to-server) with no Origin header.
      if (!origin || allowedOrigins.includes(origin) || localhostOrigin.test(origin)) {
        return callback(null, true);
      }
      callback(null, false);
    },
  })
);
app.use(morgan('dev'));
app.use(express.json());

app.use('/api', apiRouter);

// 404 for unknown /api routes.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler (Express 5 forwards rejected async handlers here automatically).
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  console.error(err);

  if (isProd) {
    // Never leak internals (e.g. raw DB errors) in production. Only explicitly
    // client-safe 4xx messages (err.expose, set by http-errors / body-parser) pass through.
    const message = status >= 500 ? 'Internal server error' : err.expose ? err.message : 'Bad request';
    return res.status(status).json({ error: message });
  }
  res.status(status).json({ error: err.message, code: err.code, stack: err.stack });
});

app.listen(PORT, (err) => {
  if (err) throw err;
  console.log(`Server listening on http://localhost:${PORT}`);
});
