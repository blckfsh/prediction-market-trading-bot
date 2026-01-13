export interface RetryLogger {
  warn(message: string): void;
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  logger?: RetryLogger,
  retries = 3,
  delay = 1000,
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // For client errors, surface the body and stop retrying
        if (response.status >= 400 && response.status < 500) {
          const body = await response.text().catch(() => '');
          throw new Error(
            `HTTP ${response.status} ${response.statusText}: ${body}`,
          );
        }
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      if (i === retries - 1) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Request timeout after 30 seconds');
        }
        throw error;
      }

      const waitTime = delay * Math.pow(2, i);
      logger?.warn?.(
        `Fetch attempt ${i + 1} failed, retrying in ${waitTime}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw new Error('All retry attempts failed');
}
