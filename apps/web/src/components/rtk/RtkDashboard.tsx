import { useRtkLive } from "../../hooks/useRtkLive.js";
import { RtkStatusCard } from "./RtkStatusCard.js";

export function RtkDashboard() {
  const { devices, transitions, connected, error } = useRtkLive();

  return (
    <section className="dashboard">
      <div className="dashboard__heading">
        <div>
          <p className="eyebrow">Navigation</p>
          <h1>RTK-Status</h1>
          <p className="subtitle">
            Live-Monitoring der DJI-Aircraft-Telemetrie über FH-Clone
          </p>
        </div>
        <div className="connection-state">
          <span className={"connection-dot " + (connected ? "is-online" : "is-offline")} />
          {connected ? "Live verbunden" : "Verbindung getrennt"}
        </div>
      </div>

      {error ? <div className="alert alert--warning">{error}</div> : null}

      <div className="rtk-grid">
        {devices.length > 0 ? (
          devices.map((snapshot) => (
            <RtkStatusCard key={snapshot.deviceId} snapshot={snapshot} />
          ))
        ) : (
          <div className="empty-state">
            <strong>Noch keine RTK-Telemetrie</strong>
            <span>
              Sobald ein Aircraft OSD/State sendet, erscheint sein GNSS-/RTK-Status hier.
            </span>
          </div>
        )}
      </div>

      <section className="events-panel">
        <div className="events-panel__header">
          <div>
            <p className="eyebrow">Ereignisse</p>
            <h2>Fix-Übergänge</h2>
          </div>
          <span className="muted">letzte {transitions.length}</span>
        </div>

        {transitions.length === 0 ? (
          <p className="muted">Noch keine Fix-Verluste oder Wiederherstellungen.</p>
        ) : (
          <div className="event-list">
            {transitions.map((event) => (
              <div
                className={"event-row event-row--" + event.transition.type}
                key={
                  event.deviceId +
                  "-" +
                  event.transition.sampledAt +
                  "-" +
                  event.transition.type
                }
              >
                <div>
                  <strong>
                    {event.transition.type === "lost"
                      ? "RTK-Fix verloren"
                      : "RTK-Fix wiederhergestellt"}
                  </strong>
                  <span>{event.deviceId}</span>
                </div>
                <time dateTime={new Date(event.transition.sampledAt).toISOString()}>
                  {new Date(event.transition.sampledAt).toLocaleTimeString("de-DE")}
                </time>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
