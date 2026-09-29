// Serialises GATT operations (Chrome cannot run several at once) and gives every operation a
// timeout, so one hung promise can never freeze all later reads and writes. Three timeouts in a
// row force a clean reconnect.

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`Bluetooth operation "${label}" timed out after ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export class GattQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private consecutiveTimeouts = 0;

  constructor(private readonly onUnhealthy: (reason: string) => void) {}

  run<T>(label: string, op: () => Promise<T>, timeoutMs = 4000): Promise<T> {
    const result = this.tail.then(() => withTimeout(op(), timeoutMs, label));
    this.tail = result.then(
      () => {
        this.consecutiveTimeouts = 0;
      },
      (err) => {
        if (err instanceof TimeoutError) {
          this.consecutiveTimeouts++;
          if (this.consecutiveTimeouts >= 3) {
            this.consecutiveTimeouts = 0;
            this.onUnhealthy(err.message);
          }
        }
      },
    );
    return result;
  }

  reset() {
    this.tail = Promise.resolve();
    this.consecutiveTimeouts = 0;
  }
}
