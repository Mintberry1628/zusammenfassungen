# 📋 Einrichtung – Schritt für Schritt

Diese Anleitung richtet die App **einmalig** ein. Danach musst du nie wieder etwas
einstellen – du teilst einfach YouTube-Videos an die App, und die Zusammenfassungen
entstehen automatisch.

Plane ca. **15–20 Minuten** ein. Du brauchst nur deinen PC und dein Handy.

> **Kurz zur Funktionsweise:** Es gibt zwei Teile.
> **Teil A** ist das „Gehirn" in deinem Google-Konto (es ruft Gemini auf und speichert alles in
> einer Google-Tabelle). **Teil B** ist die App auf deinem Handy. Am Ende verbindest du beide.

---

## 🆕 Schon eingerichtet? So spielst du eine neue Version ein (5 Min)

Wenn die App bei dir bereits läuft, musst du nichts neu aufsetzen – nur die neue Version einspielen:

1. **Backend aktualisieren:** Öffne dein Apps-Script-Projekt (<https://script.google.com>),
   markiere den alten Inhalt von `Code.gs` und ersetze ihn komplett durch den **neuen** Inhalt
   aus `apps-script/Code.gs`. **Speichern** (Diskettensymbol).
2. **Berechtigungen erweitern (nur für die Mail-Funktion nötig):** Damit das Skript dein Gmail
   lesen darf, muss die neue Berechtigung im Manifest stehen. Klicke links auf das Zahnrad
   **„Projekteinstellungen"** → Häkchen bei **„`appsscript.json`-Manifestdatei im Editor
   anzeigen"**. Öffne dann links die Datei **`appsscript.json`** und ersetze ihren Inhalt durch
   den aus `apps-script/appsscript.json`. **Speichern.**
3. **`setup` einmal ausführen:** Funktion `setup` wählen → **Ausführen**. Es kommt erneut die
   Abfrage **„Berechtigung erforderlich"** (weil Gmail dazugekommen ist) → **„Berechtigungen
   prüfen"** → Konto wählen → ggf. **„Erweitert" → „Zu … (unsicher) wechseln"** → **„Zulassen"**.
   Das legt die fehlenden Blätter („News", „Mail") und das Gmail-Label **„Zusammenfassen"** an.
   *(Deine vorhandenen Einträge bleiben erhalten.)*
4. **Web-App neu bereitstellen:** **Bereitstellen → Bereitstellungen verwalten → Stift
   (Bearbeiten) → Version „Neu" → Bereitstellen.** Die URL bleibt gleich.
5. **Handy-App aktualisieren:** Lade den Ordner `web` erneut bei deinem Host hoch (bei Netlify
   mit Konto: dieselbe Site → „Deploys" → Ordner neu draufziehen, damit die Adresse gleich
   bleibt). Öffne die App danach 1–2× neu. Deine Einstellungen (URL/Passwort) bleiben erhalten.

Fertig – oben in der App erscheint der Umschalter **🎬 YouTube / 📰 Web / 📧 Mail**.

> **Warum will das Skript jetzt an mein Gmail?** Nur, um Mails mit dem Label „Zusammenfassen" zu
> lesen und das Label danach zu entfernen. Das Skript läuft ausschließlich in **deinem** Konto;
> niemand sonst bekommt Zugriff. Wenn du die Mail-Funktion nicht willst, kannst du Schritt 2
> überspringen – die Bereiche 🎬 und 📰 funktionieren auch ohne.

---

## Teil A – Das Backend in deinem Google-Konto

### Schritt 1: Gratis-Gemini-Schlüssel holen

1. Öffne am PC **<https://aistudio.google.com/apikey>** und melde dich mit deinem Google-Konto an.
2. Klicke auf **„API-Schlüssel erstellen" / „Create API key"**.
3. Kopiere den Schlüssel (eine lange Zeichenkette). Lege ihn kurz beiseite, z. B. in einer Notiz.

> Dieser Schlüssel ist kostenlos. Grenzen der Gratis-Stufe: nur **öffentliche** Videos,
> ca. **8 Stunden Video pro Tag**, sehr lange Videos (> ~90 Min) können abgelehnt werden.

### Schritt 2: Apps-Script-Projekt anlegen

1. Öffne **<https://script.google.com>** und klicke **„Neues Projekt"**.
2. Lösche den vorhandenen Beispielcode im großen Textfeld komplett.
3. Öffne die Datei **`apps-script/Code.gs`** aus diesem Ordner, kopiere ihren **gesamten** Inhalt
   und füge ihn in das Apps-Script-Textfeld ein.
4. Ganz oben im Code findest du zwei Zeilen, die du anpasst:
   ```js
   var GEMINI_API_KEY = 'HIER_DEINEN_GEMINI_API_KEY_EINFUEGEN';
   var SHARED_SECRET  = 'HIER_EIN_EIGENES_GEHEIMES_PASSWORT_EINFUEGEN';
   ```
   - Ersetze den ersten Wert durch deinen **Gemini-Schlüssel** aus Schritt 1.
   - Ersetze den zweiten Wert durch ein **selbst ausgedachtes Passwort** (z. B. `meinGeheim123!`).
     Merke es dir – du brauchst es später in der Handy-App. (Es schützt deinen Zugang.)
5. Klicke oben auf das **Disketten-Symbol (Speichern)**.

> Optional, aber empfohlen: Klicke links auf das Zahnrad **„Projekteinstellungen"** und setze
> ein Häkchen bei **„`appsscript.json`-Manifestdatei im Editor anzeigen"**. Dann kannst du den
> Inhalt von `apps-script/appsscript.json` in die gleichnamige Datei kopieren. (Funktioniert auch ohne.)

### Schritt 3: `setup` ausführen (legt Tabelle + Automatik an)

1. Wähle oben in der Funktions-Auswahlliste (neben „Ausführen") die Funktion **`setup`** aus.
2. Klicke **„Ausführen"**.
3. Es erscheint ein Fenster **„Berechtigung erforderlich"** → **„Berechtigungen prüfen"** →
   dein Konto wählen.
4. Falls die Warnung **„Google hat diese App nicht überprüft"** kommt: das ist normal (es ist
   *dein eigenes* Skript). Klicke **„Erweitert"** → **„Zu … (unsicher) wechseln"** → **„Zulassen"**.
5. Nach kurzer Zeit ist der Lauf fertig. Unten im **Ausführungsprotokoll** steht ein Link zu
   deiner neuen Tabelle **„Zusammenfassungen"** (mit den Blättern „YouTube" und „News") – dort
   landen später alle Einträge.

> Damit ist die automatische Hintergrund-Verarbeitung aktiv: ein Auslöser arbeitet die Liste
> jede Minute ab, ganz ohne dein Zutun.

### Schritt 4: Als Web-App veröffentlichen

1. Klicke oben rechts auf **„Bereitstellen"** → **„Neue Bereitstellung"**.
2. Beim Zahnrad **„Typ auswählen"** → **„Web-App"**.
3. Stelle ein:
   - **Ausführen als:** *Ich (dein@gmail.com)*
   - **Zugriff:** **„Jeder"** (wichtig, damit die Handy-App den Dienst erreichen kann – durch
     dein Passwort aus Schritt 2 ist er trotzdem geschützt).
4. Klicke **„Bereitstellen"**, ggf. erneut Berechtigungen bestätigen.
5. Kopiere die angezeigte **„Web-App-URL"**. Sie endet auf **`/exec`**. Lege sie beiseite.

✅ **Teil A fertig.** Du hast jetzt: eine **Web-App-URL** und dein **Passwort**.

---

## Teil B – Die App auf dem Handy

Die Handy-App ist eine kleine Web-App (PWA). Damit der YouTube-„Teilen"-Button sie findet,
muss sie einmal unter einer eigenen Internet-Adresse liegen und installiert werden.

### Schritt 5: Die App ins Internet stellen (kostenlos)

**Einfachster Weg – Netlify Drop (kein Konto-Stress, ~2 Minuten):**

1. Öffne am PC **<https://app.netlify.com/drop>**.
2. Ziehe den **Ordner `web`** (aus diesem Projekt) per Drag-&-Drop auf die Seite.
3. Nach wenigen Sekunden bekommst du eine **HTTPS-Adresse** wie
   `https://zufallsname-12345.netlify.app`. Das ist deine App-Adresse. (Mit einem kostenlosen
   Netlify-Konto kannst du den Namen später hübscher machen – optional.)

**Alternative – bei Google bleiben (Firebase Hosting):** siehe Abschnitt „Firebase" weiter unten.

### Schritt 6: App auf dem Handy installieren

1. Öffne die App-Adresse aus Schritt 5 im **Chrome** auf deinem Pixel.
2. Tippe oben rechts auf das **Drei-Punkte-Menü** → **„App installieren"** bzw.
   **„Zum Startbildschirm hinzufügen"**.
3. Bestätige. Jetzt liegt „Zusammenfassungen" als Icon auf deinem Startbildschirm.

> Das Installieren ist nötig, damit die App im **Teilen-Menü** von YouTube auftaucht.

### Schritt 7: App mit dem Backend verbinden

1. Öffne die installierte App.
2. Tippe oben rechts auf das **Zahnrad ⚙️**.
3. Trage ein:
   - **Web-App-URL:** die `/exec`-Adresse aus Schritt 4.
   - **Geheimes Passwort:** exakt das Passwort aus Schritt 2.
   - **Standardsprache:** Deutsch (oder was du möchtest).
4. Tippe **„Verbindung testen"** → es sollte **„✓ Verbindung erfolgreich!"** erscheinen.
5. Tippe **„Speichern"**.

### Schritt 8: Ausprobieren 🎉

**YouTube-Video:**
1. Öffne die **YouTube-App**, suche ein beliebiges (öffentliches) Video.
2. Tippe auf **„Teilen"** → wähle **„Zusammenfassungen"**.
3. Wechsle in die App: Das Video erscheint sofort mit **⏳**. Innerhalb von ~1 Minute wechselt
   es auf **✅** und du kannst die Zusammenfassung aufklappen.

**News-Artikel:**
1. Öffne einen Artikel in **Chrome** oder in der **Google-News-App**.
2. Tippe auf **„Teilen"** → wähle **„Zusammenfassungen"**. Er landet automatisch im
   Bereich **📰 News** (der Umschalter oben wechselt selbst dorthin).
3. Genau wie beim Video: nach ~1 Minute steht die Zusammenfassung.

**Mails:**
1. Öffne in **Gmail** die Mail (Handy oder PC).
2. Vergib das Label **„Zusammenfassen"**:
   - **Handy:** Mail öffnen → **⋮** oben rechts → **„Labels ändern"** → Häkchen bei
     „Zusammenfassen" → **OK**.
   - **PC:** Mail öffnen → **Label-Symbol 🏷️** in der Leiste oben → Häkchen bei
     „Zusammenfassen" → **Übernehmen**.
3. Die App holt die Mail innerhalb einer Minute automatisch ab (oder tippe im Bereich 📧 auf
   **„Jetzt nachsehen"**) und fasst sie zusammen – **inklusive Anhänge** (PDF, Bilder, Textdateien).
   Danach entfernt die App das Label wieder; die Mail selbst bleibt unverändert.

**Mehrere auf einmal:** du kannst eine **ganze Liste von Links einfügen** (eine Zeile pro Link) und
einmal „Hinzufügen" tippen – praktisch, wenn du dir vorher mehrere Links gesammelt hast.
**Du musst dabei nicht auf den Bereich achten:** die App erkennt jeden Link selbst und sortiert
YouTube-Links nach 🎬 und alle anderen nach 📰 – auch bei gemischten Listen.

> **Tipp zu Artikeln/Web-Seiten:** Es funktioniert mit **praktisch jeder öffentlichen Seite** –
> auch mit solchen, die den direkten Zugriff blocken (Cloudflare, Cookie-Wände) oder ihren Text
> per JavaScript laden: dann schaltet sich automatisch ein Reader-Dienst dazu. Nur **echte
> Bezahlschranken/Login-Pflicht** gehen nicht (die App zeigt dann sauber einen „Fehler").

---

## Bedienung im Alltag

- **Drei Bereiche oben:** Umschalter **🎬 YouTube** / **📰 Web** / **📧 Mail**. Die App merkt sich,
  wo du zuletzt warst; die Farbe wechselt (Rot = Videos, Blau = Web, Grün = Mail).
- **Teilen** aus YouTube → landet im Bereich 🎬; **Teilen** einer Seite aus Chrome → landet im
  Bereich 📰. **Du musst nie den richtigen Bereich vorher auswählen** – die App erkennt den Link
  und wechselt selbst dorthin.
- **Mails** kommen über das Gmail-Label **„Zusammenfassen"** herein (siehe oben), samt Anhängen.
- **Du kannst die App danach schließen.** Die Zusammenfassung entsteht auf Googles Servern
  (im Minutentakt), unabhängig davon, ob App oder Handy an sind. Beim nächsten Öffnen ist sie da.
- **Mehrere Links auf einmal:** im jeweiligen Bereich eine Liste von Links einfügen (eine Zeile
  pro Link) → „Hinzufügen". Funktioniert für Videos **und** Artikel.
- **Zugeklappt** siehst du schon Vorschaubild, Titel, Quelle/Kanal und Status – bei Videos zudem
  Länge, Datum, Aufrufe, Likes, Kommentare; bei Artikeln Datum und Autor.
- **Aufklappen** einer Karte zeigt die volle Zusammenfassung (TL;DR, Kernpunkte, Details).
- **❓ Eigene Fragen:** unten im aufgeklappten Eintrag eine Frage eintippen → „Fragen". Gemini
  antwortet anhand des Videos bzw. Artikels; Fragen & Antworten bleiben gespeichert.
- **🔍 Suche:** durchsucht Titel, Quelle/Kanal, Autor **und** den Inhalt der Zusammenfassungen
  (mehrere Wörter = alle müssen vorkommen). Sucht immer im gerade aktiven Bereich.
- **⬅️ Zurück-Taste:** klappt zuerst den offenen Eintrag zu und bringt dich genau zu dieser Karte
  zurück (kein Sprung nach oben). Danach leert Zurück ggf. die Suche; erst ein weiteres
  doppeltes Zurück verlässt die App (mit kurzer Rückfrage).
- **Nochmal geteilt?** Ein bereits vorhandener Link wird einfach wieder **ganz nach oben**
  geschoben – nichts geht verloren, nichts wird doppelt verarbeitet.
- **👆 Wischen** (nach links) über eine Karte **löscht** sie schnell.
- **✊ Langes Drücken** startet die **Mehrfachauswahl**: weitere Karten antippen, dann unten
  „🗑️ Löschen" → mehrere auf einmal entfernen. Zurück beendet die Auswahl.
- **▶️ Auf YouTube / 🔗 Artikel öffnen** öffnet die Originalquelle.
- **🌐 Übersetzen…** wechselt die Sprache der Zusammenfassung (z. B. Englisch) – wird gemerkt.
- **📋 Kopieren** legt Titel, Link und Text in die Zwischenablage.
- **🔄 Erneut versuchen** bei einem Fehler (z. B. wenn eine Seite kurz gezickt hat).
- **🗑️ Löschen** entfernt den Eintrag (auch aus der Tabelle).
- Alles steht zusätzlich in deiner **Google-Tabelle „Zusammenfassungen"** (Blätter „YouTube" und
  „News") – auch am PC lesbar.

---

## Häufige Fragen / Problemlösung

**„Verbindung testen" schlägt fehl.**
- URL muss auf **`/exec`** enden (nicht `/dev`).
- Passwort in der App muss **exakt** dem `SHARED_SECRET` im Skript entsprechen.
- Hast du in Schritt 4 den Zugriff auf **„Jeder"** gestellt?

**Video bleibt bei „Fehler".**
- Tippe auf die Karte und lies die Fehlermeldung. Häufige Ursachen:
  - Video ist **privat/nicht gelistet** → Gemini kann es nicht lesen (nur öffentliche Videos).
  - Video ist **extrem lang (> ~3 Std.)** → Token-Limit. Die App verarbeitet Videos bereits in
    niedriger Auflösung (`MEDIA_RESOLUTION_LOW`, schafft ~3 Std.). Für noch längere Videos oben
    im Skript `var VIDEO_FPS = 0;` auf z. B. `0.5` setzen, speichern, „Erneut versuchen".
  - **Tageslimit** (8 Std.) erreicht → morgen erneut versuchen.
  - Meldung enthält **„model"**, **„404"** oder **„not found"** → der Modellname hat sich geändert.
    Öffne `apps-script/Code.gs`, ändere oben `var MODEL = 'gemini-2.5-flash';` z. B. auf
    `'gemini-2.0-flash'` (oder ein aktuelleres Flash-Modell), speichern, neu bereitstellen
    (siehe „Ich habe den Code später geändert"), dann „Erneut versuchen".

**Video bleibt lange bei ⏳ / „wird zusammengefasst".**
- Normal sind ein paar Minuten. Es wird **ein Video pro Minute** verarbeitet (so bleibt jeder
  Lauf sicher unter dem 6-Minuten-Limit von Apps Script). Tippe oben auf **↻** zum Aktualisieren.
- Bleibt ein Eintrag mal hängen (z. B. sehr langes Video), wird er **automatisch wieder
  aufgenommen** und nach 3 Fehlversuchen sauber als „Fehler" markiert – er hängt nicht ewig.
- Prüfe in Apps Script unter **„Auslöser"** (Wecker-Symbol links), ob ein Auslöser für
  `processPending` existiert. Falls nicht: Funktion `setup` erneut ausführen.

**Ich habe den Code (Apps Script) später geändert.**
- Für die Hintergrund-Verarbeitung genügt **Speichern** – der Auslöser nutzt immer den neuesten Code.
- Nur wenn sich das Verhalten der Web-App-Aufrufe ändert: **„Bereitstellen" → „Bereitstellungen
  verwalten" → Stift (Bearbeiten) → Version „Neu" → „Bereitstellen".** Die URL bleibt gleich.

**Ich habe die Handy-App (Ordner `web`) aktualisiert.**
- Lade den Ordner `web` erneut bei deinem Host hoch (bei Netlify mit Konto: dieselbe Site →
  „Deploys" → Ordner neu draufziehen, damit die **Adresse gleich bleibt**).
- Erhöhe vor dem Hochladen in `web/service-worker.js` die Zahl in `var CACHE = "ytz-v3";`
  (z. B. auf `"ytz-v4"`), sonst zeigt das Handy evtl. die alte Version.
- Am Handy danach die App **schließen und 1–2× neu öffnen** (ggf. Chrome-Reload), damit die neue
  Version geladen wird. Deine Einstellungen (URL/Passwort) bleiben erhalten.

---

## Alternative zu Schritt 5: Firebase Hosting (bleibt bei Google)

Nur falls du statt Netlify lieber bei Google bleiben willst. Erfordert einmalig das Tool
**Node.js** auf dem PC.

```bash
npm install -g firebase-tools
firebase login
cd web
firebase init hosting     # „use existing/ create project", public-Ordner: . (Punkt), Single-Page-App: Nein
firebase deploy
```
Firebase nennt dir danach eine `…web.app`-Adresse – die nutzt du dann in Schritt 6.

---

## Optional: Likes & Kommentare anzeigen (YouTube Data API)

**Aufrufe** und **Upload-Datum** zeigt die App ohne Zusatzaufwand. **Likes** und
**Kommentaranzahl** liefert YouTube nur über einen zusätzlichen (ebenfalls gratis) Schlüssel.
So aktivierst du sie:

1. Öffne die **Google Cloud Console**: <https://console.cloud.google.com/apis/library/youtube.googleapis.com>
   (mit demselben Google-Konto). Wähle oben ein Projekt aus oder erstelle eines.
2. Klicke **„Aktivieren"**, um die **YouTube Data API v3** einzuschalten.
3. Gehe zu **APIs & Dienste → Anmeldedaten → „Anmeldedaten erstellen" → „API-Schlüssel"**.
   Kopiere den Schlüssel.
4. Trage ihn im Apps-Script oben ein: `var YT_API_KEY = 'DEIN_SCHLUESSEL';`
5. **Speichern.** Ab dem nächsten verarbeiteten Video erscheinen Likes & Kommentare. (Für schon
   vorhandene Videos einfach „🔄 Erneut versuchen".)

> Der Schlüssel darf derselbe Google-Cloud-Schlüssel sein wie für Gemini, **sofern** in dem Projekt
> die YouTube Data API aktiviert ist. Im Zweifel einen eigenen Schlüssel nur dafür anlegen.

---

## Neue Spalten in der Tabelle (nach einem Update)

Wenn eine neue Version zusätzliche Infos speichert (Datum, Aufrufe, Likes, Kommentare, Fragen),
führe die Funktion **`setup`** im Apps-Script einmal erneut aus – sie ergänzt die fehlenden
Spalten-Überschriften. Nötig ist das nicht zwingend (die App funktioniert auch so), es macht die
Tabelle nur ordentlicher.

---

## Sicherheit & Kosten – kurz erklärt

- **Kosten:** alles kostenlos im Rahmen der Gratis-Stufen (Gemini, Apps Script, Hosting).
- **Datenschutz:** Verarbeitung und Speicherung laufen in **deinem** Google-Konto. Niemand sonst
  hat Zugriff – außer jemand kennt deine Web-App-URL **und** dein Passwort.
- **Passwort:** wähle ein nicht erratbares Passwort. Es verhindert, dass Fremde deinen Dienst
  (und damit dein Gemini-Kontingent) benutzen.
