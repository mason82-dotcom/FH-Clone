export type Fh2EventListener = (payload?: unknown) => void;

const listeners = new Map<string, Set<Fh2EventListener>>();
const connectedEvents = new Set<string>();

export function subscribeFh2Event(
  eventName: string,
  listener: Fh2EventListener
): () => void {
  const bucket = listeners.get(eventName) ?? new Set<Fh2EventListener>();
  bucket.add(listener);
  listeners.set(eventName, bucket);

  if (!connectedEvents.has(eventName)) {
    window.FH2.subscribe(eventName, (payload?: unknown) => {
      for (const handler of listeners.get(eventName) ?? []) {
        handler(payload);
      }
    });
    connectedEvents.add(eventName);
  }

  return () => {
    const current = listeners.get(eventName);
    current?.delete(listener);
    if (current?.size === 0) listeners.delete(eventName);
  };
}
