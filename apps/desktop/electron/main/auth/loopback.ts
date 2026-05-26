import http from 'http';

const SUCCESS_HTML = `<!DOCTYPE html><html><head><title>Sign in successful</title></head><body style="font-family:sans-serif;text-align:center;padding:3rem"><h1>Signed in</h1><p>You may close this window.</p></body></html>`;
const FAILURE_HTML = `<!DOCTYPE html><html><head><title>Sign in failed</title></head><body style="font-family:sans-serif;text-align:center;padding:3rem"><h1>Sign in failed</h1><p>Please close this window and try again.</p></body></html>`;

function closeServer(server: http.Server): void {
  server.close();
  // Force-close lingering keep-alive connections so the server exits immediately
  (server as http.Server & { closeAllConnections?: () => void }).closeAllConnections?.();
}

export function createLoopbackListener(
  expectedState: string,
  timeoutMs = 120_000,
): Promise<{ port: number; waitForCode: () => Promise<string> }> {
  return new Promise((resolveSetup, rejectSetup) => {
    // Callbacks set by waitForCode(); null until then.
    let onCode: ((code: string) => void) | null = null;
    let onError: ((err: Error) => void) | null = null;

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');

      if (error) {
        const reason = errorDescription ? `${error}: ${errorDescription}` : error;
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(FAILURE_HTML);
        onError?.(new Error(reason));
      } else if (!code || state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(FAILURE_HTML);
        onError?.(new Error('invalid callback'));
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(SUCCESS_HTML);
        onCode?.(code);
      }
      closeServer(server);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        rejectSetup(new Error('failed to bind loopback server'));
        return;
      }
      resolveSetup({
        port: addr.port,
        waitForCode: () =>
          new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => {
              onCode = null;
              onError = null;
              reject(new Error('OAuth callback timeout'));
              closeServer(server);
            }, timeoutMs);
            onCode = (code) => {
              clearTimeout(timer);
              resolve(code);
            };
            onError = (err) => {
              clearTimeout(timer);
              reject(err);
            };
          }),
      });
    });

    server.on('error', rejectSetup);
  });
}
