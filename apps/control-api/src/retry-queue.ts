export type RetryQueueDropPolicy = "reject-new" | "drop-oldest";

export interface RetryQueueOptions<T> {
  process(item: T): Promise<void>;
  capacity?: number;
  retryIntervalMs?: number;
  dropPolicy?: RetryQueueDropPolicy;
  onError?: (error: Error) => void;
  onDrop?: (item: T) => void;
}

export interface RetryQueueStatus {
  pending: number;
  dropped: number;
  healthy: boolean;
  lastError?: string;
}

export class RetryQueue<T> {
  private readonly items: T[] = [];
  private readonly capacity: number;
  private readonly retryIntervalMs: number;
  private readonly dropPolicy: RetryQueueDropPolicy;
  private readonly timer: NodeJS.Timeout;
  private processing: Promise<void> | undefined;
  private lastFailure: Error | undefined;
  private dropped = 0;
  private closed = false;

  constructor(private readonly options: RetryQueueOptions<T>) {
    this.capacity = options.capacity ?? 1_000;
    this.retryIntervalMs = options.retryIntervalMs ?? 1_000;
    this.dropPolicy = options.dropPolicy ?? "reject-new";
    if (this.capacity <= 0) throw new RangeError("retry_queue_capacity_must_be_positive");
    if (this.retryIntervalMs <= 0) throw new RangeError("retry_queue_interval_must_be_positive");

    this.timer = setInterval(() => this.kick(), this.retryIntervalMs);
    this.timer.unref();
  }

  get status(): RetryQueueStatus {
    return {
      pending: this.items.length,
      dropped: this.dropped,
      healthy: this.lastFailure === undefined,
      ...(this.lastFailure ? { lastError: this.lastFailure.message } : {})
    };
  }

  get ready(): boolean {
    return this.items.length === 0 && this.lastFailure === undefined;
  }

  enqueue(item: T): void {
    if (this.closed) throw new Error("retry_queue_closed");

    if (this.items.length >= this.capacity) {
      if (this.dropPolicy === "reject-new") {
        throw new Error("retry_queue_capacity_exceeded");
      }
      const dropped = this.items.shift();
      this.dropped += 1;
      if (dropped !== undefined) this.options.onDrop?.(dropped);
    }

    this.items.push(item);
    this.kick();
  }

  kick(): void {
    if (this.closed) return;
    void this.drain().catch(() => undefined);
  }

  async flush(): Promise<void> {
    await this.drain();
    if (this.items.length > 0 && this.lastFailure) {
      throw this.lastFailure;
    }
  }

  async shutdown(): Promise<void> {
    this.closed = true;
    clearInterval(this.timer);
    await this.drain();
    if (this.items.length > 0 && this.lastFailure) {
      throw this.lastFailure;
    }
  }

  private drain(): Promise<void> {
    if (this.processing) return this.processing;

    this.processing = this.drainLoop().finally(() => {
      this.processing = undefined;
    });
    return this.processing;
  }

  private async drainLoop(): Promise<void> {
    while (this.items.length > 0) {
      const item = this.items[0]!;
      try {
        await this.options.process(item);
        this.items.shift();
        this.lastFailure = undefined;
      } catch (error) {
        const normalized =
          error instanceof Error ? error : new Error(String(error));
        const changed = this.lastFailure?.message !== normalized.message;
        this.lastFailure = normalized;
        if (changed) this.options.onError?.(normalized);
        throw normalized;
      }
    }
  }
}
