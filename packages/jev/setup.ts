import { APIConnectionError, APIError, type TypeSafeClientConfig } from '@typesafe-ai/sdk';

export const jevConfig: TypeSafeClientConfig = {
  defaultModel: process.env.TYPESAFE_MODEL ?? 'jev-1.13.0',
  timeout: 10_000,
  retry: { maxRetries: 2, maxRetryAfterMs: 5_000 },
  logLevel: 'off',
};

export class JevError extends Error {
  constructor(public code: 'missing_key' | 'transport' | 'http' | 'invalid_result', public status?: number) {
    super(`Jev ${code}${status ? ` (HTTP ${status})` : ''}`);
  }
}

// Report safe errors without forwarding provider bodies or headers to chat or traces.
export function rethrowJevError(error: unknown): never {
  if (error instanceof APIError) throw new JevError('http', error.status);
  if (error instanceof APIConnectionError) throw new JevError('transport');
  throw new JevError('invalid_result');
}

export function getJevConfig(options: TypeSafeClientConfig = {}): TypeSafeClientConfig {
  const apiKey = options.apiKey ?? process.env.TYPESAFE_API_KEY;
  if (!apiKey?.trim()) throw new JevError('missing_key');
  return { ...jevConfig, ...options, apiKey };
}
