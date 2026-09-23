import type { Server } from "node:http";

export interface ShutdownStep {
  name: string;
  run(): void | Promise<void>;
}

export async function runShutdownSteps(
  steps: readonly ShutdownStep[]
): Promise<void> {
  const failures: Error[] = [];

  for (const step of steps) {
    try {
      await step.run();
    } catch (error) {
      failures.push(
        new Error(
          `${step.name}: ${errorMessage(error)}`,
          { cause: error }
        )
      );
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `Shutdown failed in ${failures.length} step(s)`
    );
  }
}

export function onceAsync(
  task: () => Promise<void>
): () => Promise<void> {
  let promise: Promise<void> | undefined;

  return () => {
    promise ??= task();
    return promise;
  };
}

export async function closeHttpServer(server: Server): Promise<void> {
  if (!server.listening) return;

  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
