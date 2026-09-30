import type { RetryQueueStatus } from "./retry-queue.js";

export interface ControlApiMetricSnapshot {
  uptimeSeconds: number;
  djiConfigured: boolean;
  djiConnected: boolean;
  activeMissions: number;
  mediaAssets: number;
  activeDrcSessions: number;
  msdkAgents: number;
  msdkControlSessions: number;
  missionQueue: RetryQueueStatus;
  telemetryQueue: RetryQueueStatus;
  topologyQueue: RetryQueueStatus;
}

type AuthzDecision = "allow" | "deny" | "ignore";
type MqttTransport = "basic" | "drc";

const SAFE_LABEL = /^[A-Za-z0-9_.:-]{1,80}$/;

function boundedLabel(value: string | undefined): string {
  if (!value) return "unknown";
  return SAFE_LABEL.test(value) ? value : "other";
}

function escapeLabel(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll('"', '\\"');
}

function sample(
  name: string,
  value: number,
  labels?: Record<string, string>
): string {
  const suffix = labels && Object.keys(labels).length > 0
    ? `{${Object.entries(labels)
        .map(([key, entry]) => `${key}="${escapeLabel(entry)}"`)
        .join(",")}}`
    : "";
  return `${name}${suffix} ${Number.isFinite(value) ? value : 0}`;
}

function queueSamples(
  prefix: string,
  status: RetryQueueStatus
): string[] {
  return [
    sample(`${prefix}_pending`, status.pending),
    sample(`${prefix}_dropped_total`, status.dropped),
    sample(`${prefix}_healthy`, status.healthy ? 1 : 0)
  ];
}

export class ControlApiMetrics {
  private readonly mqttOutbound = new Map<string, number>();
  private readonly authzDecisions = new Map<string, number>();

  observeMqttOutbound(
    transport: MqttTransport,
    method: string | undefined
  ): void {
    const labelMethod = boundedLabel(method);
    const key = `${transport}\u0000${labelMethod}`;
    this.mqttOutbound.set(key, (this.mqttOutbound.get(key) ?? 0) + 1);
  }

  observeAuthzDecision(
    decision: AuthzDecision,
    reason: string
  ): void {
    const labelReason = boundedLabel(reason);
    const key = `${decision}\u0000${labelReason}`;
    this.authzDecisions.set(key, (this.authzDecisions.get(key) ?? 0) + 1);
  }

  render(snapshot: ControlApiMetricSnapshot): string {
    const lines = [
      "# HELP fh2_process_uptime_seconds Control API process uptime.",
      "# TYPE fh2_process_uptime_seconds gauge",
      sample("fh2_process_uptime_seconds", snapshot.uptimeSeconds),

      "# HELP fh2_dji_mqtt_configured Whether the DJI MQTT backend is configured.",
      "# TYPE fh2_dji_mqtt_configured gauge",
      sample("fh2_dji_mqtt_configured", snapshot.djiConfigured ? 1 : 0),

      "# HELP fh2_dji_mqtt_connected Whether the DJI Basic-Link MQTT adapter is connected.",
      "# TYPE fh2_dji_mqtt_connected gauge",
      sample("fh2_dji_mqtt_connected", snapshot.djiConnected ? 1 : 0),

      "# HELP fh2_active_missions Current number of automatically tracked active missions.",
      "# TYPE fh2_active_missions gauge",
      sample("fh2_active_missions", snapshot.activeMissions),

      "# HELP fh2_media_assets Current number of read-only media overlay assets.",
      "# TYPE fh2_media_assets gauge",
      sample("fh2_media_assets", snapshot.mediaAssets),

      "# HELP fh2_drc_active_sessions Current number of non-idle DRC runtime sessions.",
      "# TYPE fh2_drc_active_sessions gauge",
      sample("fh2_drc_active_sessions", snapshot.activeDrcSessions),

      "# HELP fh2_msdk_agents Current authenticated MSDK agents.",
      "# TYPE fh2_msdk_agents gauge",
      sample("fh2_msdk_agents", snapshot.msdkAgents),

      "# HELP fh2_msdk_control_sessions Current non-closed MSDK control sessions.",
      "# TYPE fh2_msdk_control_sessions gauge",
      sample("fh2_msdk_control_sessions", snapshot.msdkControlSessions),

      "# HELP fh2_mission_persistence_queue_pending Pending mission persistence operations.",
      "# TYPE fh2_mission_persistence_queue_pending gauge",
      ...queueSamples("fh2_mission_persistence_queue", snapshot.missionQueue),

      "# HELP fh2_telemetry_persistence_queue_pending Pending telemetry persistence operations.",
      "# TYPE fh2_telemetry_persistence_queue_pending gauge",
      ...queueSamples("fh2_telemetry_persistence_queue", snapshot.telemetryQueue),

      "# HELP fh2_topology_persistence_queue_pending Pending topology persistence operations.",
      "# TYPE fh2_topology_persistence_queue_pending gauge",
      ...queueSamples("fh2_topology_persistence_queue", snapshot.topologyQueue),

      "# HELP fh2_mqtt_outbound_total Successful MQTT publishes observed by transport and method.",
      "# TYPE fh2_mqtt_outbound_total counter"
    ];

    for (const [key, value] of [...this.mqttOutbound.entries()].sort()) {
      const [transport, method] = key.split("\u0000");
      lines.push(
        sample("fh2_mqtt_outbound_total", value, {
          transport: transport ?? "unknown",
          method: method ?? "unknown"
        })
      );
    }

    lines.push(
      "# HELP fh2_authz_decisions_total EMQX authorization decisions by result and bounded reason.",
      "# TYPE fh2_authz_decisions_total counter"
    );

    for (const [key, value] of [...this.authzDecisions.entries()].sort()) {
      const [decision, reason] = key.split("\u0000");
      lines.push(
        sample("fh2_authz_decisions_total", value, {
          decision: decision ?? "unknown",
          reason: reason ?? "unknown"
        })
      );
    }

    return lines.join("\n") + "\n";
  }
}
