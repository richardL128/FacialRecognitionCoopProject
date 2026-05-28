import pino from 'pino';

const isServer = typeof window === 'undefined';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  ...(isServer && process.env.NODE_ENV !== 'production'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
  redact: {
    paths: ['*.password', '*.token', '*.secret', '*.apiKey', '*.accessToken', '*.refreshToken'],
    censor: '[REDACTED]',
  },
});

/** Create a child logger scoped to an API request */
export function requestLogger(meta: {
  method: string;
  path: string;
  tenantId?: string;
  userId?: string;
  requestId?: string;
}) {
  return logger.child(meta);
}
