export interface DjiServiceReply {
  tid: string;
  result: number;
  data: Record<string, unknown>;
  bid?: string;
  method?: string;
}

export interface DjiServiceRequester {
  requestService(
    gatewaySn: string,
    method: string,
    data: unknown,
    timeoutMs?: number
  ): Promise<DjiServiceReply>;
}

export class DjiServiceError extends Error {
  constructor(
    readonly method: string,
    readonly result: number,
    readonly reply: DjiServiceReply
  ) {
    super(`DJI service ${method} failed with result ${result}`);
    this.name = "DjiServiceError";
  }
}
