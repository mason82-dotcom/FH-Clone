# GitHub Sensitive-Data Support Handoff

Stand: 23.09.2026

## Zweck

Dieses Dokument beschreibt den letzten externen Schritt für Issue #73.

Die FH2-Repository-Historie und die öffentlichen Dokumentationspfade sind
bereinigt. Alte GitHub-Objekte können trotzdem noch über bereits bekannte
Objekt-IDs beziehungsweise gecachte Ansichten erreichbar sein.

GitHub verlangt für die vollständige serverseitige Entfernung ein privates
Supportticket mit Metadaten aus dem lokalen Clone, in dem
`git-filter-repo --sensitive-data-removal` ausgeführt wurde.

## Wichtig

Keine alten Commit-/Blob-IDs, Raw-Fixture-Dateinamen, GPS-Werte oder andere
sensible Inhalte in öffentliche Issues, Pull Requests oder CI-Logs kopieren.

## Lokale Support-Zusammenfassung

Im bereinigten lokalen Clone:

```bash
node scripts/github-sensitive-data-support-handoff.mjs
```

Die Standardausgabe zeigt nur Zählwerte:

- Anzahl geänderter Refs
- Anzahl betroffener Pull-Request-Refs
- Anzahl Branch-/Tag-/sonstiger Refs
- Anzahl First Changed Commits
- Anzahl verwaister LFS-Objekte

Die eigentlichen IDs bleiben ausgeblendet.

Für das **private** GitHub-Supportticket:

```bash
node scripts/github-sensitive-data-support-handoff.mjs --include-private
```

Diese Ausgabe darf nicht in öffentliche Projektartefakte kopiert werden.

## Benötigte lokale Dateien

Das Skript liest ausschließlich:

```text
.git/filter-repo/changed-refs
.git/filter-repo/first-changed-commits
.git/filter-repo/orphaned_lfs_objects   # optional
```

Fehlen `changed-refs` oder `first-changed-commits`, bricht das Skript ab.
Es führt **keinen** neuen History-Rewrite aus.

## Inhalt des privaten Supporttickets

GitHub benötigt insbesondere:

1. Repository `mason82-dotcom/FH-Clone`
2. Anzahl betroffener Pull-Request-Refs
3. die First Changed Commit(s)
4. falls vorhanden: Hinweis auf orphaned LFS objects und die von
   `git-filter-repo` erzeugte Datei

Nach erfolgreicher GitHub-Bereinigung ausschließlich prüfen, dass die intern
bekannten Altobjekte nicht mehr erreichbar sind.

Danach:

```text
#73 schließen
-> finalen main prüfen
-> v3.0.0 taggen
-> GitHub Release veröffentlichen
-> #25 schließen
```
