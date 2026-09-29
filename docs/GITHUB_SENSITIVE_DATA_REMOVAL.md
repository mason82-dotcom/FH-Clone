# GitHub Sensitive-Data Removal – Abschlussnachweis

Stand: 29.09.2026

## Status

Issue #73 ist abgeschlossen.

GitHub Support hat nach dem bereits durchgeführten History-Rewrite einen
serverseitigen Repository-Cleanup ausgeführt. Die anschließende
Nicht-Erreichbarkeitsprüfung war erfolgreich:

- die intern bekannten historischen sensiblen Commit-Objekte sind über die
  GitHub-Commit-Schnittstelle nicht mehr auflösbar,
- die betroffenen geschlossenen, nicht gemergten Pull Requests liefern keine
  Commit-Liste mehr,
- deren frühere Head-Commits sind nicht mehr direkt auflösbar,
- aktuelle Branches und Tags enthalten die entfernte Historie nicht,
- zum Auditzeitpunkt bestanden keine Forks/Network Copies mit dieser Historie.

Damit ist das Repository-/Hosting-Cleanup-Gate für V3.0.0 erfüllt.

## Sicherheitsregel

Keine alten Commit-/Blob-IDs, Raw-Fixture-Dateinamen, GPS-Werte oder andere
sensible Inhalte in öffentliche Issues, Pull Requests, Dokumentation oder
CI-Logs kopieren.

Ältere lokale Clones dürfen die entfernte Historie nicht wieder nach GitHub
pushen. Vor einem Push aus einem Alt-Clone ist sicherzustellen, dass er auf der
bereinigten Historie basiert.

## Historischer Support-Handoff

Für den ursprünglichen Cleanup wurde ein privater GitHub-Support-Handoff
verwendet. Der Repository-Helper bleibt als fail-safe Werkzeug erhalten:

```bash
node scripts/github-sensitive-data-support-handoff.mjs
node scripts/github-sensitive-data-support-handoff.mjs --include-private
```

Er arbeitet nur mit vorhandenen `.git/filter-repo`-Metadaten und führt
**keinen** neuen History-Rewrite aus. Fehlen diese Metadaten in einem Clone,
bricht das Skript absichtlich ab.

Die damals benötigten privaten Ref-/Commit-Details werden nicht im Repository
dokumentiert.

## Abschlussfolge

```text
History-Rewrite
-> GitHub-Support-Cleanup
-> bekannte Altobjekte nicht mehr erreichbar
-> #73 geschlossen
-> finale V3.0.0-CI
-> v3.0.0-Tag
-> GitHub Release
```

Ein erneuter `git filter-repo`-Lauf ist für diesen abgeschlossenen Fall weder
erforderlich noch vorgesehen.
