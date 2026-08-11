# Facebook-Foto-Sync für die "Nails"-Galerie

## Context

Die Galerie-Seite hat seit dem letzten Redesign einen "Nails"-Tab, der bewusst als Platzhalter angelegt wurde: er sollte irgendwann automatisch Fotos aus Facebook/Instagram zeigen, statt manuell gepflegter Bilder wie bei Schmuck/Schuhe/Muster.

Nadine postet ihre Nagelarbeiten seit Jahren primär auf der Facebook-Seite "Priema Nageldesign" (`https://www.facebook.com/NagelstudioPriemaNageldesign/photos_by`) — dort liegen bereits mehrere hundert Fotos. Ziel dieser Änderung: diese Fotos automatisch in die Website-Galerie holen, ohne dass Nadine sie zusätzlich manuell hochladen muss, und ohne dass die Website dadurch aufgebläht wird oder GitHub Pages' Traffic-Grenzen strapaziert.

Die Facebook-Seite ist ohne Login nicht automatisiert abrufbar (geprüft) — ein Zugriff ist nur über die offizielle Graph API mit einem Access Token möglich.

## Ziele

- Alle aktuell auf Facebook geposteten Fotos (Seiten-eigene Uploads, `type=uploaded` — entspricht dem "photos_by"-Tab) einmalig in die Website-Galerie importieren.
- Künftige Facebook-Uploads erscheinen automatisch auf der Website, ohne dass jemand manuell etwas tun muss — mit spürbarer, aber nicht sofortiger Verzögerung (bis zu einem Tag ist akzeptabel).
- Einzelne synchronisierte Fotos müssen sich ausblenden lassen, ohne sie auf Facebook zu löschen.
- Das Repo darf durch mehrere hundert Fotos nicht unkontrolliert wachsen.
- Ein Seitenbesuch darf nicht automatisch alle Fotos herunterladen — nur eine erste Portion, der Rest erst auf Wunsch.
- Bricht der Sync (z. B. abgelaufener Token), darf das den normalen Website-Deploy nicht gefährden.

## Nicht-Ziele

- Kein Echtzeit-Sync (ein täglicher Abgleich reicht).
- Keine Instagram-Anbindung in diesem Schritt (gleiches Muster ließe sich später übertragen, ist aber nicht Teil dieser Spec).
- Keine automatische Bildkategorisierung/-sortierung nach Inhalt — Reihenfolge ist chronologisch (neueste zuerst).
- Kein voll automatisierter Ersteinrichtungs-Flow für den Facebook-Token — das bleibt ein einmaliger, von Menschen ausgeführter Schritt.

## Architektur

Geplanter GitHub-Actions-Workflow, der Fotos herunterlädt und ins Repo committet ("bake-in" statt Live-Abruf). Die Website bleibt vollständig statisch.

```
Facebook Graph API
      │  (täglich, per Cron + manuell auslösbar)
      ▼
GitHub Action "sync-facebook-photos"
      │  lädt neue Fotos, überspringt bekannte + ausgeschlossene
      ▼
Commit: src/images/nails/*.jpg + src/_data/nailsGallery.json
      │  (nur falls es Änderungen gibt)
      ▼
Bestehender Build-und-Deploy-Workflow läuft wie gewohnt an
```

Verworfene Alternativen (mit Begründung) sind im Brainstorming-Verlauf dokumentiert: Live-Abruf im Browser (Token-Exposition, ablaufende FB-CDN-Links, Tracking) und Facebooks "Page Plugin"-Widget (kein Token nötig, aber keine gestaltbare Fotogalerie, bringt Tracking-Cookies mit).

## Komponenten

**`.github/workflows/sync-facebook-photos.yml`**
Neuer Workflow, getrennt vom bestehenden Deploy-Workflow. Trigger: `schedule` (täglich) + `workflow_dispatch` (manuell). Schritte: Checkout, Node einrichten, Sync-Skript ausführen, bei Änderungen committen + pushen.

**`scripts/sync-facebook-photos.mjs`**
Node-Skript, das:
1. `src/_data/nailsGallery.json` liest (bereits bekannte Facebook-Foto-IDs).
2. `src/_data/nailsExcluded.json` liest (Foto-IDs, die nicht angezeigt werden sollen).
3. Graph API `GET /{page-id}/photos?type=uploaded&fields=id,images,created_time` aufruft (paginiert, `access_token` aus Umgebungsvariable).
4. Für jede neue, nicht ausgeschlossene ID: aus dem `images`-Array der API-Antwort (mehrere Auflösungen) die größte Variante auswählt und als `src/images/nails/{id}.jpg` speichert — die weitere Verkleinerung auf 480px übernimmt anschließend `eleventy-img` beim Website-Build, genau wie bei den anderen Galerien.
5. Für jede neu ausgeschlossene, aber lokal vorhandene ID: die Datei entfernt.
6. `nailsGallery.json` aktualisiert (`id`, `filename`, `createdTime`), neueste zuerst sortiert.
7. Ohne Änderungen: Skript beendet sich ohne Commit (kein leerer Commit-Verlauf).

**`src/_data/nailsExcluded.json`**
Einfaches JSON-Array von Facebook-Foto-IDs. Manuell von Nadine/Justin gepflegt (direkt im Repo bzw. über die GitHub-Weboberfläche editierbar, keine Code-Kenntnisse nötig).

**`.eleventy.js` — neue Bildvariante für Sync-Fotos**
Bestehende `imageShortcode`/`imageUrlShortcode` bleiben für die kuratierten Galerien (Schmuck/Schuhe/Muster) unverändert (mehrere Breiten, WebP+JPEG). Für Nails-Sync-Fotos wird derselbe Shortcode mit reduzierten Parametern aufgerufen (`widths=[480]`), da Facebook-Fotos ohnehin schon komprimiert sind — kein Mehrwert durch größere Varianten. Ergebnis: ca. 2 Dateien statt 8 pro Foto.

**`src/galerie.njk` — Nails-Panel**
Rendert statt der festen Bild-Range (wie bei Schmuck/Schuhe/Muster) über `nailsGallery` (Eleventy-Daten aus `nailsGallery.json`) eine Schleife. Jedes Foto: `data-src`/`data-srcset` statt echtem `src`/`srcset` (Ausnahme: die erste Portion, siehe unten), damit nicht aktivierte Bilder nicht heruntergeladen werden. Am Ende ein "Mehr laden"-Button, sofern mehr Fotos vorhanden sind als die aktuelle Portion zeigt.

**`src/js/gallery.js` — Paginierung**
Neue, generische Funktion: findet Grids mit `data-page-size` (z. B. `24`), aktiviert beim Laden die erste Portion (kopiert `data-src`→`src`, `data-srcset`→`srcset`), verbirgt den Rest. Klick auf "Mehr laden" aktiviert die nächste Portion, Button verschwindet, wenn nichts mehr übrig ist. Nutzt denselben Mechanismus, den die anderen Kategorien später auch bekommen könnten, falls sie einmal über ~30 Fotos wachsen — für sie aktuell aber ungenutzt (kein `data-page-size` gesetzt → normales Verhalten wie bisher).

## Fehlerbehandlung

- Ungültiger/abgelaufener Access Token: Sync-Workflow schlägt sichtbar fehl (roter Actions-Lauf, E-Mail-Benachrichtigung an den Repo-Owner), rührt aber nichts am bestehenden Website-Inhalt an. Der reguläre Deploy-Workflow ist komplett unabhängig und läuft weiter normal.
- Einzelnes Foto lässt sich nicht herunterladen (z. B. gelöscht zwischen Abruf der Liste und Download): wird übersprungen und beim nächsten Lauf erneut versucht, bricht den Gesamtlauf nicht ab.
- Rate Limits der Graph API: bei diesem Volumen (ein Abruf pro Tag, wenige hundert Fotos) nicht relevant.

## Setup (einmalig, außerhalb dieser Codeänderung)

Nadine muss (ggf. mit Justins Anleitung) über die Facebook-Entwicklertools eine App anlegen und sich selbst als Seiten-Admin einen Page Access Token für die Graph API erzeugen (kein Meta-Review nötig, da nur die eigene Seite gelesen wird). Der Token wird als GitHub-Actions-Secret (`FB_PAGE_ACCESS_TOKEN`) hinterlegt, die Page-ID als `FB_PAGE_ID`. Eine Schritt-für-Schritt-Anleitung wird als Teil der Umsetzung mitgeliefert.

## Speicher- und Traffic-Abschätzung

Ins Repo committet wird pro Foto **ein Original mit ca. 1024px Breite** (die kleinste von Facebook angebotene Variante, die noch mindestens 1024px breit ist — nicht die tatsächlich größte, die oft 2048px+ hat). Bei ~500–600 Fotos à geschätzt 150–250 KB sind das ca. 80–150 MB Repo-Zuwachs — für Git noch unproblematisch, im Gegensatz zu den Volloriginalen. Die 1024px sind gleichzeitig die Quelle für die Lightbox-Ansicht. Die daraus abgeleiteten Auslieferungsdateien (WebP + JPEG, 480px für das Grid) entstehen erst beim Build in `_site/` und liegen nicht im Repo. Erste Seitenlast durch den "Mehr laden"-Mechanismus auf eine Portion (Standard: 24 Fotos, ca. 1–2 MB) begrenzt, unabhängig von der Gesamtzahl der Fotos. Sollte die Sammlung über die Jahre sehr groß werden, ist eine harte Obergrenze ("nur die neuesten X synchronisieren") im Sync-Skript leicht nachrüstbar — aktuell nicht nötig (YAGNI).

## Verifikation

- Sync-Skript lokal mit einem Test-Token gegen die echte Seite laufen lassen, Ergebnis in `src/images/nails/` und `nailsGallery.json` prüfen.
- Erneuter Lauf ohne neue Facebook-Fotos: kein Commit, keine erneuten Downloads (Dedupe funktioniert).
- Foto-ID in `nailsExcluded.json` eintragen, Sync erneut laufen lassen: Foto verschwindet aus Daten und Dateisystem.
- Lokaler Eleventy-Build + Browser-Test: Nails-Tab zeigt erste Portion, "Mehr laden" lädt weitere nach, Netzwerk-Tab bestätigt, dass nicht aktivierte Bilder vor dem Klick nicht geladen werden.
- GitHub-Actions-Lauf des neuen Sync-Workflows beobachten (grüner Haken, sinnvoller Commit oder "nichts zu tun").
