import type { Server } from "node:http";
import { sanitizeUnknown } from "./infra/sanitize";

type Signal = "SIGINT" | "SIGTERM";
type LifecycleError = {
  signal: Signal;
  error: unknown;
};
type LifecycleDependencies = {
  stopWorker: (options: { timeoutMs: number }) => Promise<void>;
  closeServer: () => Promise<void>;
  on: (signal: Signal, listener: () => void) => unknown;
  reportError: (error: LifecycleError) => void;
};

export function createServerLifecycle(dependencies: LifecycleDependencies) {
  let registered = false;
  let shutdownPromise: Promise<void> | null = null;
  const shutdown = (_signal: Signal): Promise<void> => {
    if (!shutdownPromise) {
      shutdownPromise = (async () => {
        try {
          await dependencies.stopWorker({ timeoutMs: 10_000 });
        } finally {
          await dependencies.closeServer();
        }
      })();
    }
    return shutdownPromise;
  };
  return {
    register(): void {
      if (registered) return;
      registered = true;
      for (const signal of ["SIGINT", "SIGTERM"] as const) {
        dependencies.on(signal, () => {
          void shutdown(signal).catch((error) => {
            dependencies.reportError({
              signal,
              error: sanitizeUnknown(error, {
                depth: 2,
                maxItems: 5,
                maxString: 300,
              }),
            });
          });
        });
      }
    },
    shutdown,
  };
}

export function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
