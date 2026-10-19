import OpenAI from 'openai';

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRetriable =
        error instanceof OpenAI.APIError &&
        [429, 500, 502, 503, 504].includes(error.status);
      const isLastAttempt = attempt === maxAttempts - 1;

      if (!isRetriable || isLastAttempt) throw error;
      if (signal?.aborted) throw error;

      const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('unreachable');
}
