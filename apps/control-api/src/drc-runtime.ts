export interface DrcTransportLossManager {
  listOpenSessions(): Promise<Array<{ gatewaySn: string }>>;
  markTransportLost(
    gatewaySn: string,
    reason?: string
  ): Promise<unknown>;
}

export async function markAllDrcTransportsLost(
  manager: DrcTransportLossManager,
  reason: string
): Promise<void> {
  const open = await manager.listOpenSessions();
  const results = await Promise.allSettled(
    open.map((session) =>
      manager.markTransportLost(session.gatewaySn, reason)
    )
  );

  const failures = results
    .filter(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected"
    )
    .map((result) =>
      result.reason instanceof Error
        ? result.reason
        : new Error(String(result.reason))
    );

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `DRC transport-loss update failed for ${failures.length} session(s)`
    );
  }
}
