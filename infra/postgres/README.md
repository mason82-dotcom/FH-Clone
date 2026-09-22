# PostgreSQL

FH-Clone führt PostgreSQL schrittweise als optionale Persistenzschicht ein.

Aktuelle Migration:

```text
migrations/001_dji_gateway_registry.sql
```

Anwendung:

```bash
psql "$DATABASE_URL" -f infra/postgres/migrations/001_dji_gateway_registry.sql
```

Die Gateway-Registry dient Inventar/Diagnose. EMQX-Autorisierung vertraut
bewusst nicht auf alte persistierte Zuordnungen, sondern auf frische
`update_topo`-Daten der laufenden Control-API.
