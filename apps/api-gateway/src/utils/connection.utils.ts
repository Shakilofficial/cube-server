import { checkTcpConnection } from "@cube/logger";

/**
 * Periodically checks a TCP connection with a delay and retry threshold.
 * Returns true if the port is reachable before retries are exhausted.
 */
export async function checkConnectionWithRetry(
  urlStr: string,
  defaultPort: number,
  retries = 8,
  delay = 1500,
): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    const isUp = await checkTcpConnection(urlStr, defaultPort);
    if (isUp) return true;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return false;
}
