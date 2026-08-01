# 🎬📰 Zusammenfassungen

Eine kleine, persönliche App, um **YouTube-Videos UND News-Artikel per „Teilen"-Button
automatisch zusammenfassen zu lassen** – inklusive Stapelverarbeitung und dauerhaftem Archiv.

Statt jedes Video bzw. jeden Artikel einzeln an Gemini zu schicken, teilst du es einfach an
diese App. Im Hintergrund fasst **Gemini** den Inhalt zusammen und legt ihn mit **Titel,
Quelle und Original-Link** ab – sodass du auch viel später noch weißt, worum es ging, und
zur Quelle zurückfindest.

Beide Bereiche sind in der App per **Umschalter oben (🎬 YouTube / 📰 News)** getrennt; die
Signaturfarbe wechselt dabei (Rot für Videos, Blau für News), damit du immer weißt, wo du bist.

> ➡️ **Zum Loslegen: [SETUP.md](SETUP.md)** (Schritt-für-Schritt, ~15–20 Min, kostenlos).

---

## Was die App kann

- **Drei Bereiche, gleiche Funktionen:** 🎬 **YouTube-Videos**, 📰 **Web-Seiten/Artikel** und
  📧 **E-Mails** – getrennt per Umschalter oben, jeder mit eigenem Archiv.
- **Teilen genügt:** YouTube → „Teilen" → diese App. Oder in **Chrome** eine beliebige Seite →
  „Teilen" → diese App.
- **Automatische Einsortierung:** egal in welchem Bereich du einen Link einfügst oder hineinteilst –
  die App erkennt YouTube-Links und legt sie unter 🎬 ab, alles andere unter 📰. Auch **gemischte
  Listen** werden korrekt aufgeteilt.
- **E-Mails per Gmail-Label:** in Gmail (Handy *oder* PC) das Label **„Zusammenfassen"** vergeben –
  die App holt die Mail automatisch ab und fasst sie **samt Anhängen** (PDF, Bilder, Textdateien)
  zusammen; danach entfernt sie das Label wieder.
- **Stapelverarbeitung / Mehrere Links einfügen:** mehrere Links auf einmal einfügen (eine Zeile
  pro Link) und „Hinzufügen" tippen – ideal, wenn du dir vorher eine Liste gesammelt hast.
  Die App arbeitet alles automatisch im Hintergrund ab.
- **Vollständiges Archiv:** jede Karte zeigt Vorschaubild, **Titel**, Quelle/Kanal/Absender, Status
  und die ausklappbare Zusammenfassung (TL;DR · Kernpunkte · Details).
  Bei Videos zusätzlich **Länge, Upload-Datum, Aufrufe, Likes, Kommentare**; bei Artikeln
  **Datum und Autor**; bei Mails **Datum und Anhänge**.
- **Eigene Fragen zum Inhalt:** im aufgeklappten Eintrag gezielt nachfragen – Gemini antwortet
  anhand des Videos, Artikels bzw. der Mail; der Frage-/Antwort-Verlauf wird gespeichert.
- **Sprache pro Eintrag umschaltbar:** Standard Deutsch, auf Knopfdruck z. B. Englisch übersetzen.
- **Suche:** durchsucht Titel, Quelle/Kanal, Autor, Anhangnamen und den Inhalt aller Zusammenfassungen.
- **Komfortable Bedienung:** Zurück-Taste klappt den Artikel zu und bleibt bei der Karte (statt
  die App zu verlassen); **Wischen** löscht ein Video, **langes Drücken** startet die
  **Mehrfachauswahl** zum Sammel-Löschen; erneut geteilte Videos rutschen wieder nach ganz oben.
- **Offline lesbar:** zuletzt geladene Zusammenfassungen sind auch ohne Netz sichtbar.
- **Zusätzlich als Google-Tabelle:** alles steht parallel in einer Tabelle in deinem Drive – auch am PC.

## Architektur (kurz)

```
 YouTube/Artikel ─Teilen─►  PWA (Handy)  ─JSONP+Secret─►  Apps Script (dein Google-Konto)
                              ▲                                │  Minuten-Trigger
                              └──── Liste / Übersetzen ◄───────┤  ruft Gemini
                                                               ▼      (Video-URL bzw. Artikeltext)
                                                    Google-Tabelle (Blätter: YouTube / News)
```

- **Frontend** (`web/`): installierbare PWA, host-neutral (z. B. Netlify oder Firebase Hosting).
- **Backend** (`apps-script/`): Google Apps Script als Web-App; speichert in einer Google-Tabelle
  (zwei Blätter „YouTube" und „News"). Videos gehen als **Link** direkt an Gemini; bei Artikeln
  lädt das Skript die Seite, extrahiert den **Fliesstext** und schickt diesen an Gemini.

## Projektstruktur

```
apps-script/
  Code.gs               Backend: Queue, Hintergrund-Verarbeitung, Gemini, Metadaten, setup()
  appsscript.json       Manifest (Web-App-Zugriff, Berechtigungen)
web/
  index.html            Komplette App (UI + Teilen-Handler + Backend-Aufrufe)
  manifest.webmanifest  PWA-Manifest inkl. share_target (Teilen-Ziel)
  service-worker.js     Installierbarkeit + Offline
  icons/                App-Icons (per generate_icons.py erzeugt)
  generate_icons.py     Erzeugt die Icons neu (optional)
SETUP.md                Einrichtung Schritt für Schritt
README.md               Diese Übersicht
```

## Technische Eckdaten

- **KI:** Google Gemini (Modell in `Code.gs` einstellbar, Standard `gemini-2.5-flash`).
  Videos gehen direkt als Link über `generateContent` (`file_data`/`file_uri`); Artikel werden
  als extrahierter Fliesstext übergeben.
- **Speicher:** eine Google-Tabelle mit drei Blättern („YouTube", „News", „Mail" – je eine Zeile pro Eintrag).
- **Mails:** Apps Script liest per `GmailApp` die Unterhaltungen mit dem Label `MAIL_LABEL`
  (Standard „Zusammenfassen"), übernimmt sie und entfernt das Label. Anhänge gehen als
  `inline_data` an Gemini (PDF/Bilder/Text, Gesamtgröße gedeckelt über `MAIL_ATTACHMENT_MAX_BYTES`).
  Dafür ist der zusätzliche OAuth-Bereich `gmail.modify` nötig (siehe `appsscript.json`).
- **Hintergrund:** zeitgesteuerter Apps-Script-Auslöser (jede Minute) arbeitet offene Einträge ab.
- **CORS:** Kommunikation Handy↔Backend per **JSONP** (umgeht die CORS-Eigenheiten von Apps Script).
- **Schutz:** gemeinsames Geheim-Token bei jedem Aufruf.

## Grenzen (Gemini-Gratis-Stufe)

- **Videos:** nur **öffentliche** Videos; ca. **8 Std. Video pro Tag**; sehr lange Videos
  (> ~90 Min) können abgelehnt werden – die App zeigt das sauber als „Fehler" und du kannst
  „Erneut versuchen".
- **Artikel / beliebige Web-Seiten:** das Skript versucht zuerst einen direkten Abruf; blockt die
  Seite das (z. B. **Cloudflare** oder eine **Cookie-/Consent-Wall**) oder lädt sie ihren Text erst
  per JavaScript, greift automatisch ein **Reader-Fallback** (`READER_ENDPOINT` in `Code.gs`,
  Standard [r.jina.ai](https://r.jina.ai)), der die Seite rendert und sauberen Text liefert.
  Dadurch lassen sich **praktisch beliebige öffentliche Web-Seiten** zusammenfassen.
  **Google-News-Wrapper-Links** werden nach Möglichkeit auf den Originalartikel aufgelöst.
  Grenzen bleiben: echte **Bezahlschranken/Login-Pflicht** und Seiten, die automatisierte Zugriffe
  komplett sperren – dann erscheint ein „Fehler" mit Hinweis.

## Anpassen

- **Anderes Modell / andere Standardsprache:** oben in `apps-script/Code.gs` (`MODEL`, `DEFAULT_LANG`).
- **Zusammenfassungs-Stil:** `summaryPrompt()` (Video), `newsSummaryPrompt()` (Artikel),
  `mailSummaryPrompt()` (Mail) in `Code.gs`.
- **Anderes Gmail-Label:** Konstante `MAIL_LABEL` oben in `Code.gs`.
- **Sprachenliste der App:** Konstante `LANGS` in `web/index.html`.
- **Icons neu erzeugen:** `python web/generate_icons.py`.
