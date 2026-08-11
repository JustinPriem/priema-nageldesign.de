# Facebook-Foto-Sync einrichten

Einmaliger Schritt, danach läuft der Sync automatisch. Muss von einer
Person gemacht werden, die **Admin der Facebook-Seite "Priema
Nageldesign"** ist.

## 1. Facebook-App anlegen

1. Auf [developers.facebook.com/apps](https://developers.facebook.com/apps) einloggen (mit dem Facebook-Account, der Admin der Seite ist).
2. "App erstellen" → Typ **"Sonstige"** → **"Unternehmen"** wählen.
3. Einen beliebigen App-Namen vergeben (z. B. "Priema Nageldesign Sync").
4. Die App bleibt im **Entwicklungsmodus** — das reicht, da nur die eigene
   Seite gelesen wird. Ein Facebook-Review ist **nicht** nötig.

## 2. Page Access Token erzeugen

1. Im Facebook-App-Dashboard links auf **"Graph API Explorer"** (unter
   Tools) gehen, oder direkt
   [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer)
   öffnen.
2. Oben rechts die gerade erstellte App auswählen.
3. Bei "User or Page" **"Get Page Access Token"** wählen und die Seite
   "Priema Nageldesign" auswählen.
4. Bei den Berechtigungen **`pages_read_engagement`** und
   **`pages_show_list`** hinzufügen, dann den Token generieren.
5. Der erzeugte Token ist zunächst nur 1–2 Stunden gültig — das ist
   normal. Um ihn langlebig zu machen:
   - Auf das kleine "i"-Symbol neben dem Token klicken → **"Open in
     Access Token Debugger"**.
   - Dort auf **"Extend Access Token"** klicken. Der verlängerte Token
     gilt ca. 60 Tage und erneuert sich als Page Token danach in der
     Regel automatisch, solange der Account Admin der Seite bleibt.
   - **Vor dem Kopieren prüfen:** Der Access Token Debugger muss jetzt
     bei "Expires" **"Never"** anzeigen. Steht dort weiterhin ein Datum
     bzw. eine Uhrzeit, ist die Verlängerung schiefgegangen — dann
     diesen Schritt wiederholen, statt den kurzlebigen Token zu
     hinterlegen.
6. Den langen Token-String kopieren.

## 3. Page-ID herausfinden

1. Auf der Facebook-Seite "Priema Nageldesign" → "Info" → dort steht die
   numerische **Seiten-ID**. Alternativ im Graph API Explorer
   `me/accounts` abfragen — die Antwort enthält `id` für jede
   verwaltete Seite.

## 4. GitHub-Secrets anlegen

1. Im GitHub-Repository `JustinPriem/priema-nageldesign.de` → **Settings
   → Secrets and variables → Actions**.
2. **"New repository secret"** → Name `FB_PAGE_ACCESS_TOKEN`, Wert der
   Token-String aus Schritt 2.
3. Noch ein Secret → Name `FB_PAGE_ID`, Wert die Seiten-ID aus Schritt 3.

## 5. Ersten Sync auslösen

1. Im Repository → Tab **"Actions"** → Workflow **"Sync Facebook
   photos"** auswählen → **"Run workflow"** → **"Run workflow"**
   bestätigen.
2. Nach ca. 1–2 Minuten ist der Lauf grün, und ein neuer Commit mit den
   Facebook-Fotos erscheint automatisch im Repository. Die Website zeigt
   die Fotos nach dem nächsten automatischen Deploy (läuft direkt im
   Anschluss).

## Ein Foto von der Website ausblenden

Ohne es auf Facebook zu löschen: die Facebook-Foto-ID (aus dem Dateinamen
in `src/images/nails/`, z. B. `123456789.jpg` → ID `123456789`) in
`src/_data/nailsExcluded.json` eintragen und committen (oder direkt in
GitHub im Browser bearbeiten). Beim nächsten Sync-Lauf verschwindet das
Foto von der Website.

Wichtig andersherum: Ein Foto **auf Facebook zu löschen entfernt es
nicht** automatisch von der Website — der Sync fügt nur hinzu. Soll ein
auf Facebook gelöschtes Foto auch von der Website verschwinden, muss
seine ID genauso in `nailsExcluded.json` eingetragen werden.

## Wenn der Sync mal fehlschlägt

Das betrifft nur den Sync-Workflow, nicht die Website selbst — die bleibt
online und zeigt weiterhin die zuletzt synchronisierten Fotos. Häufigste
Ursache: der Token ist abgelaufen oder wurde widerrufen. Schritte 2 und 4
oben wiederholen, um einen neuen Token zu hinterlegen.

Die Fehler-Benachrichtigungsmail zu einem fehlgeschlagenen geplanten Lauf
geht an den GitHub-Account, der die Workflow-Datei zuletzt bearbeitet hat
— also voraussichtlich an den Account, der dieses Setup durchführt. Dort
also nach Benachrichtigungen schauen, wenn etwas stillschweigend nicht
mehr läuft.

## Wenn der Sync nach längerer Pause gar nicht mehr läuft

GitHub deaktiviert `schedule`-gesteuerte Workflows automatisch, wenn in
einem Repository 60 Tage lang keine Aktivität stattgefunden hat. Wenn der
Sync nach einer längeren ruhigen Phase kommentarlos aufhört zu laufen,
ist das meist die Ursache. Lösung: im Repository → Tab **"Actions"** →
Workflow **"Sync Facebook photos"** öffnen und dort wieder aktivieren
("Enable workflow"). Alternativ genügt ein beliebiger kleiner Commit oder
ein einmaliger manueller Lauf über "Run workflow".
