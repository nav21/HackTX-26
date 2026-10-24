// Timestamped console logging: "[12:01:03] <- EVT,OPEN,4"

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const c = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const paint = {
  dim: c('2'),
  red: c('31'),
  green: c('32'),
  yellow: c('33'),
  blue: c('34'),
  magenta: c('35'),
  cyan: c('36'),
  bold: c('1'),
  bg: (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s)),
};

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return paint.dim(`[${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}]`);
}

function out(stream, tag, msg) {
  stream.write(`${stamp()} ${tag ? tag + ' ' : ''}${msg}\n`);
}

export const log = {
  info: (m) => out(process.stdout, '', m),
  /** line received from the device */
  rx: (m) => out(process.stdout, paint.cyan('←'), m),
  /** something sent to the server / device */
  tx: (m) => out(process.stdout, paint.green('→'), m),
  warn: (m) => out(process.stderr, paint.yellow('!'), paint.yellow(m)),
  error: (m) => out(process.stderr, paint.red('x'), paint.red(m)),
  dim: (m) => out(process.stdout, '', paint.dim(m)),
};
