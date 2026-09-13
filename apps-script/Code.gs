/**
 * Zusammenfassungen – Backend (Google Apps Script)
 * ================================================
 * Nimmt YouTube-Links UND News-Artikel-Links entgegen, fasst sie im Hintergrund
 * per Gemini zusammen und legt alles in einer Google-Tabelle ab
 * (zwei Blaetter: "YouTube" und "News").
 *
 * EINRICHTUNG (einmalig):
 *   1) Die Funktion zugangsdatenSetzen() einmal ausfuehren (Werte stehen direkt darin) –
 *      sie legt Gemini-Schluessel und Passwort in den Skript-Eigenschaften ab. Danach die
 *      Werte in der Funktion wieder loeschen: diese Datei enthaelt dann KEINE Geheimnisse
 *      mehr und darf versioniert werden.
 *   2) Im Menue die Funktion setup() einmal ausfuehren (Berechtigungen bestaetigen).
 *   3) Als Web-App veroeffentlichen: Bereitstellen -> Neue Bereitstellung ->
 *      Typ "Web-App", Ausfuehren als "Ich", Zugriff "Jeder".
 *   4) Die erhaltene Web-App-URL + dein SHARED_SECRET in der Handy-App eintragen.
 *
 * Details siehe SETUP.md.
 */

// ============================ GEHEIMNISSE =================================
/*
 * Schluessel und Passwort stehen NICHT mehr im Code, sondern in den Skript-Eigenschaften
 * (Apps Script: Projekteinstellungen -> Skripteigenschaften). Grund: so laesst sich diese
 * Datei sichern und versionieren, ohne die Zugangsdaten mitzuveroeffentlichen – und ein
 * verlorener PC kostet nicht mehr das halbe Projekt.
 *
 * Einmal ausfuehren, Werte danach hier wieder leeren:
 */
function zugangsdatenSetzen() {
  var werte = {
    GEMINI_API_KEY: '',   // aistudio.google.com/apikey
    SHARED_SECRET:  '',   // dasselbe Passwort wie in der Handy-App
    YT_API_KEY:     ''    // optional, fuer Likes/Kommentare
  };
  var props = PropertiesService.getScriptProperties();
  var gesetzt = [];
  for (var k in werte) {
    if (werte[k]) { props.setProperty(k, werte[k]); gesetzt.push(k); }
  }
  Logger.log(gesetzt.length ? ('Gespeichert: ' + gesetzt.join(', ') +
    '\nJetzt die Werte oben wieder leeren und speichern.')
    : 'Nichts gesetzt – trage die Werte oben in der Funktion ein.');
  return zugangsdatenPruefen();
}

/** Zeigt an, was hinterlegt ist – ohne die Werte selbst auszugeben. */
function zugangsdatenPruefen() {
  var p = PropertiesService.getScriptProperties();
  var bericht = ['Gemini-Schluessel: ' + (p.getProperty('GEMINI_API_KEY') ? 'hinterlegt' : 'FEHLT'),
                 'Passwort: ' + (p.getProperty('SHARED_SECRET') ? 'hinterlegt' : 'FEHLT'),
                 'YouTube-Schluessel: ' + (p.getProperty('YT_API_KEY') ? 'hinterlegt' : 'nicht gesetzt (optional)')];
  Logger.log(bericht.join('\n'));
  return bericht.join(' | ');
}

/** Liest eine Skript-Eigenschaft; wirft nie, damit ein fehlender Wert nicht den Start sprengt. */
function prop_(name, standard) {
  try {
    var v = PropertiesService.getScriptProperties().getProperty(name);
    return (v === null || v === '') ? standard : v;
  } catch (e) { return standard; }
}

// ====================== KONFIGURATION (HIER ANPASSEN) ======================

/** Dein gratis Gemini-API-Schluessel – liegt in den Skript-Eigenschaften. */
var GEMINI_API_KEY = prop_('GEMINI_API_KEY', '');

/** Geheimes Passwort – liegt in den Skript-Eigenschaften, identisch in der Handy-App. */
var SHARED_SECRET = prop_('SHARED_SECRET', '');

/** Gemini-Modell. Alternativen z. B. 'gemini-2.0-flash'. */
var MODEL = 'gemini-2.5-flash';

/**
 * Medienaufloesung fuer die Video-Analyse.
 * 'MEDIA_RESOLUTION_LOW' spart Tokens und erlaubt ~3x laengere Videos (bis ca. 3 Std.) –
 * fuer Zusammenfassungen ideal. Alternativen: 'MEDIA_RESOLUTION_MEDIUM' (mehr Bilddetails,
 * aber nur ~1 Std.) oder '' (Standard des Modells).
 */
var MEDIA_RESOLUTION = 'MEDIA_RESOLUTION_LOW';

/**
 * Manuelle Vorgabe der Bilder pro Sekunde (0 = automatisch je nach Videolaenge).
 * Bei 0 senkt die App die Bildrate bei langen Videos selbst, damit das Token-Limit
 * eingehalten und die Verarbeitung schnell genug bleibt. Fester Wert z. B. 0.5 erzwingt diesen.
 */
var VIDEO_FPS = 0;

/** Max. automatische Wiederholungen, falls ein Lauf ins 6-Minuten-Limit laeuft. */
var MAX_ATTEMPTS = 3;

/**
 * Obergrenze fuer die Antwortlaenge. Wichtig bei gemini-2.5-*: die Denk-Schritte des Modells
 * zaehlen mit gegen dieses Budget. Ist es knapp, ist es nach dem Nachdenken aufgebraucht – die
 * Antwort bleibt LEER, finishReason ist trotzdem 'STOP'. Genau das war die Meldung
 * "Von Gemini abgelehnt (STOP)".
 */
var MAX_OUTPUT_TOKENS = 8192;

/**
 * Denk-Budget von gemini-2.5-*. 0 = aus (schneller, billiger, und keine leeren Antworten mehr).
 * Fuer knifflige Inhalte kann man z. B. 1024 setzen; -1 ueberlaesst es dem Modell.
 */
var THINKING_BUDGET = 0;

/** Wie oft ein Gemini-Aufruf bei voruebergehenden Fehlern (429/500/503) wiederholt wird. */
var GEMINI_RETRIES = 3;

/** Standardsprache der Zusammenfassungen. */
var DEFAULT_LANG = 'Deutsch';

/**
 * OPTIONAL: YouTube-Data-API-Schluessel (fuer exakte Aufrufe/Likes/Kommentare/Datum).
 * Leer lassen -> App liest Aufrufe + Upload-Datum direkt von der YouTube-Seite (Likes/Kommentare
 * dann meist leer). Mit Schluessel werden alle Werte exakt gefuellt. Anleitung in SETUP.md.
 */
var YT_API_KEY = prop_('YT_API_KEY', '');

/** Browser-Kennung fuers Laden von Artikelseiten (manche Server verlangen einen echten User-Agent). */
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

/**
 * Reader-Dienst als FALLBACK fuer Web-Seiten, die den direkten Abruf blockieren
 * (z. B. Cloudflare, Cookie-/Consent-Walls) oder ihren Text erst per JavaScript aufbauen.
 * Wird nur benutzt, wenn der direkte Abruf zu wenig Text liefert. Rendert die Seite und gibt
 * sauberen Text zurueck – dadurch lassen sich praktisch beliebige oeffentliche Web-Seiten lesen.
 * Leer lassen ('') schaltet den Fallback ab (dann nur direkter Abruf).
 * Hinweis: Der Reader ist ein externer Gratis-Dienst; die (oeffentliche) Artikel-URL wird an ihn
 * uebergeben. Alternative Reader liessen sich hier eintragen (Format: ENDPUNKT + vollstaendige URL).
 */
var READER_ENDPOINT = 'https://r.jina.ai/';

/**
 * Gmail-Label, mit dem du eine Mail zum Zusammenfassen markierst.
 * Das Label wird beim Einrichten automatisch angelegt. Sobald die App eine so markierte
 * Unterhaltung uebernommen hat, entfernt sie das Label wieder (die Mail selbst bleibt unberuehrt).
 */
var MAIL_LABEL = 'Zusammenfassen';

/**
 * YouTube-Playlist, die automatisch eingelesen wird (wie das Gmail-Label, nur fuer Videos).
 * Lege in der YouTube-App eine Playlist mit genau diesem Namen an; jedes Video, das du dort
 * hinzufuegst, landet innerhalb einer Minute in der App und wird danach aus der Playlist
 * entfernt (das Video selbst bleibt unberuehrt).
 *
 * WICHTIG: Googles eigene Liste "Spaeter ansehen" laesst sich per Programm NICHT lesen –
 * das hat Google 2016 abgeschaltet. Deshalb braucht es eine eigene Playlist.
 * Leerer Text = Funktion aus.
 */
var YT_PLAYLIST = 'Zusammenfassen';

/** Max. Groesse aller Anhaenge, die pro Mail an Gemini geschickt werden (Bytes). */
var MAIL_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;

// ===========================================================================

// ------- Spalten "YouTube" -------
var COL = {
  id: 1, url: 2, title: 3, channel: 4, durationSeconds: 5, durationText: 6,
  thumbnail: 7, status: 8, language: 9, summary: 10, translations: 11,
  error: 12, addedAt: 13, processedAt: 14,
  publishedAt: 15, viewCount: 16, likeCount: 17, commentCount: 18, qa: 19,
  tags: 20, read: 21, input: 22
};
var COLS = 22;
var HEADER = ['id', 'url', 'title', 'channel', 'durationSeconds', 'durationText',
  'thumbnail', 'status', 'language', 'summary', 'translations', 'error',
  'addedAt', 'processedAt', 'publishedAt', 'viewCount', 'likeCount',
  'commentCount', 'qa', 'tags', 'read', 'input'];

// ------- Spalten "News" -------
var NEWS_COL = {
  id: 1, url: 2, title: 3, source: 4, image: 5, status: 6, language: 7,
  summary: 8, translations: 9, error: 10, addedAt: 11, processedAt: 12,
  publishedAt: 13, author: 14, qa: 15, tags: 16, read: 17, input: 18
};
var NEWS_COLS = 18;
var NEWS_HEADER = ['id', 'url', 'title', 'source', 'image', 'status', 'language',
  'summary', 'translations', 'error', 'addedAt', 'processedAt',
  'publishedAt', 'author', 'qa', 'tags', 'read', 'input'];

// ------- Spalten "Mail" (wie News, plus Anhaenge) -------
var MAIL_COL = {
  id: 1, url: 2, title: 3, source: 4, image: 5, status: 6, language: 7,
  summary: 8, translations: 9, error: 10, addedAt: 11, processedAt: 12,
  publishedAt: 13, author: 14, qa: 15, attachments: 16, tags: 17, read: 18
};
var MAIL_COLS = 18;
var MAIL_HEADER = ['id', 'url', 'subject', 'from', 'image', 'status', 'language',
  'summary', 'translations', 'error', 'addedAt', 'processedAt',
  'receivedAt', 'author', 'qa', 'attachments', 'tags', 'read'];

/** Liefert die Konfiguration (Blattname + Spalten) fuer eine Art ('yt', 'news' oder 'mail'). */
function cfgFor(kind) {
  if (kind === 'news') return { sheetName: 'News', COL: NEWS_COL, COLS: NEWS_COLS, HEADER: NEWS_HEADER };
  if (kind === 'mail') return { sheetName: 'Mail', COL: MAIL_COL, COLS: MAIL_COLS, HEADER: MAIL_HEADER };
  return { sheetName: 'YouTube', COL: COL, COLS: COLS, HEADER: HEADER };
}

/** Alle unterstuetzten Arten. */
var KINDS = ['yt', 'news', 'mail'];

// =============================== EINRICHTUNG ===============================

/** Einmal ausfuehren: legt Tabelle + beide Blaetter (YouTube/News) an und erstellt den Minuten-Trigger. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  var ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('Zusammenfassungen');
    props.setProperty('SHEET_ID', ss.getId());
  }
  // Blatt "YouTube" (altes Standardblatt uebernehmen, damit vorhandene Videos erhalten bleiben)
  var yt = ss.getSheetByName('YouTube');
  if (!yt) { yt = ss.getSheets()[0]; yt.setName('YouTube'); }
  ensureColumnsFor(yt, COLS);
  yt.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
  yt.setFrozenRows(1);
  yt.setColumnWidth(COL.summary, 600);
  // Blatt "News"
  var nw = ss.getSheetByName('News');
  if (!nw) { nw = ss.insertSheet('News'); }
  ensureColumnsFor(nw, NEWS_COLS);
  nw.getRange(1, 1, 1, NEWS_HEADER.length).setValues([NEWS_HEADER]);
  nw.setFrozenRows(1);
  nw.setColumnWidth(NEWS_COL.summary, 600);
  // Blatt "Mail"
  var ml = ss.getSheetByName('Mail');
  if (!ml) { ml = ss.insertSheet('Mail'); }
  ensureColumnsFor(ml, MAIL_COLS);
  ml.getRange(1, 1, 1, MAIL_HEADER.length).setValues([MAIL_HEADER]);
  ml.setFrozenRows(1);
  ml.setColumnWidth(MAIL_COL.summary, 600);
  ensureMailLabel();
  ensureTrigger();
  var url = ss.getUrl();
  Logger.log('Setup fertig.\nDeine Tabelle: ' + url);
  return url;
}

/** Sorgt dafuer, dass ein Blatt genug Spalten hat (fuer neue Felder). */
function ensureColumnsFor(sheet, cols) {
  var have = sheet.getMaxColumns();
  if (have < cols) sheet.insertColumnsAfter(have, cols - have);
}

/** Legt das Gmail-Label zum Markieren an, falls es noch fehlt. Wirft nie. */
function ensureMailLabel() {
  try {
    if (!GmailApp.getUserLabelByName(MAIL_LABEL)) GmailApp.createLabel(MAIL_LABEL);
  } catch (e) {}
}

/** Stellt sicher, dass der Minuten-Trigger fuer processPending existiert. */
function ensureTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processPending') return;
  }
  ScriptApp.newTrigger('processPending').timeBased().everyMinutes(1).create();
}

function getSpreadsheet() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Noch nicht eingerichtet – bitte setup() ausfuehren.');
  return SpreadsheetApp.openById(id);
}

/** Holt das Blatt fuer eine Art; legt "News" bei Bedarf automatisch an (auch ohne setup()). */
function getSheetFor(kind) {
  var ss = getSpreadsheet();
  var kc = cfgFor(kind);
  var sh = ss.getSheetByName(kc.sheetName);
  if (sh) return sh;
  if (kind === 'yt') return ss.getSheets()[0]; // Altbestand: erstes Blatt = YouTube
  sh = ss.insertSheet(kc.sheetName);
  ensureColumnsFor(sh, kc.COLS);
  sh.getRange(1, 1, 1, kc.HEADER.length).setValues([kc.HEADER]);
  sh.setFrozenRows(1);
  sh.setColumnWidth(kc.COL.summary, 600);
  return sh;
}

function getSheetUrl() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id).getUrl() : '';
}

// ============================ WEB-APP-ROUTER ==============================

function doGet(e) {
  var p = (e && e.parameter) || {};
  var cb = p.callback;
  try {
    if (!SHARED_SECRET) {
      return out(cb, { ok: false, error: 'Backend nicht eingerichtet: Passwort fehlt. ' +
        'Im Apps Script einmal zugangsdatenSetzen() ausfuehren.' });
    }
    if (String(p.token) !== String(SHARED_SECRET)) {
      return out(cb, { ok: false, error: 'Falsches oder fehlendes Token.' });
    }
    var kind = (KINDS.indexOf(p.kind) >= 0) ? p.kind : 'yt';
    var action = p.action || 'list';
    switch (action) {
      case 'add':       return out(cb, doAddFor(kind, p.url));
      case 'list':      return out(cb, { ok: true, light: !!p.light,
                          entries: listEntriesFor(kind, !!p.light) });
      case 'get':       return out(cb, doGetOne(kind, p.id));
      case 'getmany':   return out(cb, doGetMany(kind, p.ids));
      case 'translate': return out(cb, doTranslate(kind, p.id, p.lang));
      case 'ask':       return out(cb, doAskFor(kind, p.id, p.q));
      case 'retry':     return out(cb, doRetry(kind, p.id));
      case 'delete':    return out(cb, doDelete(kind, p.id));
      case 'read':      return out(cb, doSetRead(kind, p.id, p.value === '1'));
      case 'search':    return out(cb, doSearch(kind, p.q));
      case 'scan':      return out(cb, kind === 'yt' ? doScanPlaylist() : doScanMail());
      case 'usetext':   return out(cb, doUseText(kind, p.id, p.text));
      case 'addtext':   return out(cb, doAddText(p.text, p.title));
      case 'ping':      return out(cb, { ok: true, message: 'pong', sheet: getSheetUrl() });
      default:          return out(cb, { ok: false, error: 'Unbekannte Aktion: ' + action });
    }
  } catch (err) {
    return out(cb, { ok: false, error: String(err) });
  }
}

/**
 * Teilen-Ziel sendet ggf. POST – auf dieselbe Logik umleiten.
 * Zusaetzlich: Laengere Inhalte (selbst eingefuegter Text, z. B. ein Transkript) kommen als
 * JSON im Rumpf, weil sie nicht mehr in eine Adresszeile passen.
 */
function doPost(e) {
  var p = {};
  var q = (e && e.parameter) || {};
  for (var k in q) p[k] = q[k];
  try {
    if (e && e.postData && e.postData.contents &&
        String(e.postData.contents).charAt(0) === '{') {
      var body = JSON.parse(e.postData.contents);
      for (var b in body) p[b] = body[b];
    }
  } catch (err) {}
  return doGet({ parameter: p });
}

/** JSONP, wenn ein callback uebergeben wurde, sonst normales JSON. */
function out(cb, obj) {
  if (cb) {
    return ContentService
      .createTextOutput(cb + '(' + JSON.stringify(obj) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===================== AKTIONEN: YOUTUBE (hinzufuegen) ====================

function doAddYt(url) {
  ensureTrigger();
  var id = extractVideoId(url);
  if (!id) return { ok: false, error: 'Kein gueltiger YouTube-Link erkannt.' };
  var sheet = getSheetFor('yt');
  ensureColumnsFor(sheet, COLS);
  var existing = findRowById(sheet, COL.id, id);
  if (existing > 0) {
    var vals = sheet.getRange(existing, 1, 1, COLS).getValues()[0];
    if (String(vals[COL.status - 1]) === 'error') {
      // Fehlgeschlagener Versuch: die kaputte Zeile wegwerfen und sauber neu aufnehmen,
      // damit nicht zwei Eintraege desselben Videos in der Liste stehen.
      sheet.deleteRow(existing);
    } else {
      // Bereits vorhanden: Zeile ans Tabellenende verschieben -> erscheint in der App ganz oben
      vals[COL.addedAt - 1] = new Date().toISOString();
      sheet.deleteRow(existing);
      sheet.appendRow(vals);
      return { ok: true, duplicate: true, entry: ytRowToObj(vals) };
    }
  }
  var canonical = 'https://www.youtube.com/watch?v=' + id;
  var row = [
    id, canonical, '', '', '', '',
    'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
    'pending', DEFAULT_LANG, '', '{}', '',
    new Date().toISOString(), '',
    '', '', '', '', '[]'
  ];
  sheet.appendRow(row);
  return { ok: true, entry: ytRowToObj(row) };
}

// ======================= AKTIONEN: NEWS (hinzufuegen) =====================

function doAddNews(url) {
  ensureTrigger();
  url = cleanUrl(url);
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'Kein gueltiger Artikel-Link erkannt.' };
  var sheet = getSheetFor('news');
  ensureColumnsFor(sheet, NEWS_COLS);
  var id = newsId(url);
  var existing = findRowById(sheet, NEWS_COL.id, id);
  if (existing > 0) {
    var vals = sheet.getRange(existing, 1, 1, NEWS_COLS).getValues()[0];
    if (String(vals[NEWS_COL.status - 1]) === 'error') {
      sheet.deleteRow(existing);          // kaputten Versuch verwerfen, gleich neu aufnehmen
    } else {
      vals[NEWS_COL.addedAt - 1] = new Date().toISOString();
      sheet.deleteRow(existing);
      sheet.appendRow(vals);
      return { ok: true, duplicate: true, entry: newsRowToObj(vals) };
    }
  }
  var row = [];
  for (var i = 0; i < NEWS_COLS; i++) row.push('');
  row[NEWS_COL.id - 1] = id;
  row[NEWS_COL.url - 1] = url;
  row[NEWS_COL.source - 1] = domainOf(url);
  row[NEWS_COL.status - 1] = 'pending';
  row[NEWS_COL.language - 1] = DEFAULT_LANG;
  row[NEWS_COL.translations - 1] = '{}';
  row[NEWS_COL.addedAt - 1] = new Date().toISOString();
  row[NEWS_COL.qa - 1] = '[]';
  sheet.appendRow(row);
  return { ok: true, entry: newsRowToObj(row) };
}

// =============== AKTIONEN: Verteiler + Mail-Uebernahme aus Gmail ==========

function doAddFor(kind, url) {
  if (kind === 'mail') {
    return { ok: false, error: 'Mails werden nicht per Link hinzugefuegt. Vergib in Gmail das ' +
      'Label "' + MAIL_LABEL + '" – die App holt die Mail dann automatisch.' };
  }
  return (kind === 'news') ? doAddNews(url) : doAddYt(url);
}

/**
 * Haengt selbst eingefuegten Text an einen vorhandenen Eintrag und stellt ihn wieder auf
 * "pending" – der naechste Lauf fasst dann DIESEN Text zusammen statt Video/Artikel.
 * Gedacht fuer Faelle, in denen Gemini das Video nicht auswerten darf (Altersfreigabe,
 * Laendersperre, nicht oeffentlich).
 */
function doUseText(kind, id, text) {
  text = String(text || '').trim();
  if (text.length < 100) return { ok: false, error: 'Der Text ist zu kurz (mindestens 100 Zeichen).' };
  var kc = cfgFor(kind);
  if (!kc.COL.input) return { ok: false, error: 'Fuer diesen Bereich nicht moeglich.' };
  var sheet = getSheetFor(kind);
  ensureColumnsFor(sheet, kc.COLS);
  var idx = findRowById(sheet, kc.COL.id, id);
  if (idx < 0) return { ok: false, error: 'Eintrag nicht gefunden.' };
  var range = sheet.getRange(idx, 1, 1, kc.COLS);
  var v = range.getValues()[0];
  v[kc.COL.input - 1] = text.slice(0, 45000);   // eine Tabellenzelle fasst 50.000 Zeichen
  v[kc.COL.status - 1] = 'pending';
  v[kc.COL.error - 1] = '';
  v[kc.COL.summary - 1] = '';
  v[kc.COL.translations - 1] = '{}';            // Zaehler zuruecksetzen: neuer Anlauf
  range.setValues([v]);
  ensureTrigger();
  return { ok: true, entry: rowToObjFor(kind, v) };
}

/** Legt aus reinem Text einen neuen Eintrag im Bereich "News" an (ohne Adresse). */
function doAddText(text, titel) {
  text = String(text || '').trim();
  if (text.length < 100) return { ok: false, error: 'Der Text ist zu kurz (mindestens 100 Zeichen).' };
  ensureTrigger();
  var C = NEWS_COL;
  var sheet = getSheetFor('news');
  ensureColumnsFor(sheet, NEWS_COLS);
  var row = [];
  for (var i = 0; i < NEWS_COLS; i++) row.push('');
  var ersteZeile = String(titel || text.split(String.fromCharCode(10))[0] || '').trim().slice(0, 90);
  row[C.id - 1] = 'txt_' + Utilities.getUuid().slice(0, 12);
  row[C.url - 1] = '';
  row[C.title - 1] = ersteZeile || 'Eigener Text';
  row[C.source - 1] = 'Eigener Text';
  row[C.status - 1] = 'pending';
  row[C.language - 1] = DEFAULT_LANG;
  row[C.translations - 1] = '{}';
  row[C.addedAt - 1] = new Date().toISOString();
  row[C.qa - 1] = '[]';
  row[C.input - 1] = text.slice(0, 45000);
  sheet.appendRow(row);
  return { ok: true, entry: newsRowToObj(row) };
}

function doAskFor(kind, id, q) {
  if (kind === 'mail') return doAskMail(id, q);
  return (kind === 'news') ? doAskNews(id, q) : doAskYt(id, q);
}

/** Sofort in Gmail nach markierten Mails schauen (Knopf in der App). */
function doScanMail() {
  ensureTrigger();
  var n = 0;
  try { n = ingestMail(); } catch (e) { return { ok: false, error: String(e) }; }
  return { ok: true, added: n };
}

/**
 * Holt neue Videos aus der Playlist YT_PLAYLIST in die Tabelle und raeumt sie dort weg.
 * Braucht den erweiterten Dienst "YouTube Data API v3" (siehe appsscript.json) – der laeuft
 * mit DEINEM Konto, ein API-Schluessel ist dafuer nicht noetig.
 */
function ingestPlaylist() {
  if (!YT_PLAYLIST) return 0;
  if (typeof YouTube === 'undefined') return 0;   // Dienst (noch) nicht aktiviert
  var plId = findePlaylistId(YT_PLAYLIST);
  if (!plId) return 0;
  var res = YouTube.PlaylistItems.list('snippet', { playlistId: plId, maxResults: 25 });
  var items = (res && res.items) || [];
  var added = 0;
  for (var i = 0; i < items.length; i++) {
    try {
      var vid = items[i].snippet && items[i].snippet.resourceId &&
                items[i].snippet.resourceId.videoId;
      if (!vid) continue;
      var r = doAddYt('https://www.youtube.com/watch?v=' + vid);
      if (r && r.ok && !r.duplicate) added++;
      YouTube.PlaylistItems.remove(items[i].id);   // uebernommen -> aus der Playlist nehmen
    } catch (e) {}
  }
  return added;
}

/** Sucht unter den eigenen Playlists die mit dem passenden Namen (Gross-/Kleinschreibung egal). */
function findePlaylistId(name) {
  var gesucht = String(name).trim().toLowerCase();
  var seite = null;
  for (var runde = 0; runde < 5; runde++) {
    var res = YouTube.Playlists.list('snippet', { mine: true, maxResults: 50, pageToken: seite });
    var items = (res && res.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (String(items[i].snippet.title).trim().toLowerCase() === gesucht) return items[i].id;
    }
    seite = res && res.nextPageToken;
    if (!seite) break;
  }
  return '';
}

/** Manuell/aus der App: sofort in der Playlist nachsehen. */
function doScanPlaylist() {
  ensureTrigger();
  if (typeof YouTube === 'undefined') {
    return { ok: false, error: 'Der YouTube-Dienst ist im Skript noch nicht aktiviert.' };
  }
  var n = 0;
  try {
    n = ingestPlaylist();
  } catch (e) {
    return { ok: false, error: youtubeFehlertext(e) };
  }
  return { ok: true, added: n };
}

/**
 * Macht aus der (oft fremdsprachigen) Ausnahme eine Anweisung, mit der man etwas anfangen kann.
 * Die fehlende Freigabe ist der mit Abstand haeufigste Fall: Ein neuer Berechtigungsumfang wird
 * erst wirksam, wenn im Skript-Editor einmal eine Funktion ausgefuehrt und zugestimmt wurde.
 */
function youtubeFehlertext(e) {
  var t = String(e || '');
  if (/auth\/youtube|dopu[sš]tenje|permission|Berechtigung|authoriz/i.test(t)) {
    return 'Die Freigabe fuer YouTube fehlt noch. Oeffne script.google.com, waehle oben die ' +
      'Funktion "pruefePlaylist", klicke Ausfuehren und bestaetige die Berechtigung ' +
      '(ggf. "Erweitert" -> "Zu ... (unsicher) wechseln" -> "Zulassen").';
  }
  return t;
}

/**
 * Zum Ausfuehren im Skript-Editor: erzwingt die Freigabe-Abfrage und sagt, ob die Playlist
 * gefunden wurde. Das Ergebnis steht im Ausfuehrungsprotokoll.
 */
function pruefePlaylist() {
  if (typeof YouTube === 'undefined') {
    Logger.log('Der erweiterte Dienst "YouTube" ist nicht aktiviert.');
    return;
  }
  var alle = YouTube.Playlists.list('snippet', { mine: true, maxResults: 50 });
  var namen = ((alle && alle.items) || []).map(function (p) { return p.snippet.title; });
  Logger.log('Deine Playlists: ' + (namen.length ? namen.join(' | ') : '(keine gefunden)'));
  var id = findePlaylistId(YT_PLAYLIST);
  if (!id) {
    Logger.log('KEINE Playlist mit dem Namen "' + YT_PLAYLIST + '" gefunden. Name genau so anlegen.');
    return;
  }
  var items = YouTube.PlaylistItems.list('snippet', { playlistId: id, maxResults: 25 });
  Logger.log('Playlist "' + YT_PLAYLIST + '" gefunden, enthaelt ' +
             (((items && items.items) || []).length) + ' Video(s). Alles bereit.');
}

/**
 * Holt alle Unterhaltungen mit dem Label MAIL_LABEL in die Tabelle (eine Zeile je Unterhaltung)
 * und entfernt danach das Label. Gibt die Anzahl neu uebernommener Unterhaltungen zurueck.
 */
function ingestMail() {
  var label = GmailApp.getUserLabelByName(MAIL_LABEL);
  if (!label) { ensureMailLabel(); return 0; }
  var threads = label.getThreads(0, 20);
  if (!threads.length) return 0;
  var sheet = getSheetFor('mail');
  ensureColumnsFor(sheet, MAIL_COLS);
  var added = 0;
  for (var i = 0; i < threads.length; i++) {
    var th = threads[i];
    try {
      var id = th.getId();
      if (findRowById(sheet, MAIL_COL.id, id) < 0) {
        var msgs = th.getMessages();
        var first = msgs[0], last = msgs[msgs.length - 1];
        var names = [];
        for (var m = 0; m < msgs.length; m++) {
          var atts = msgs[m].getAttachments({ includeInlineImages: false });
          for (var a = 0; a < atts.length; a++) names.push(atts[a].getName());
        }
        var row = [];
        for (var c = 0; c < MAIL_COLS; c++) row.push('');
        row[MAIL_COL.id - 1] = id;
        row[MAIL_COL.url - 1] = 'https://mail.google.com/mail/u/0/#all/' + id;
        row[MAIL_COL.title - 1] = th.getFirstMessageSubject() || '(kein Betreff)';
        row[MAIL_COL.source - 1] = cleanFrom(first.getFrom());
        row[MAIL_COL.status - 1] = 'pending';
        row[MAIL_COL.language - 1] = DEFAULT_LANG;
        row[MAIL_COL.translations - 1] = '{}';
        row[MAIL_COL.addedAt - 1] = new Date().toISOString();
        row[MAIL_COL.publishedAt - 1] = last.getDate().toISOString();
        row[MAIL_COL.author - 1] = cleanFrom(first.getFrom());
        row[MAIL_COL.qa - 1] = '[]';
        row[MAIL_COL.attachments - 1] = JSON.stringify(names);
        sheet.appendRow(row);
        added++;
      }
      th.removeLabel(label); // uebernommen -> Markierung entfernen (Mail bleibt unveraendert)
    } catch (e) {}
  }
  if (added) SpreadsheetApp.flush();
  return added;
}

/** Macht aus 'Max Muster <max@example.com>' ein lesbares 'Max Muster'. */
function cleanFrom(from) {
  var s = String(from || '').trim();
  var m = s.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/);
  var name = m ? m[1].trim() : '';
  return name || s.replace(/[<>]/g, '');
}

/** Beantwortet eine Frage zur Mail (liest die Unterhaltung dafuer erneut). */
function doAskMail(id, q) {
  q = String(q || '').trim();
  if (!q) return { ok: false, error: 'Keine Frage angegeben.' };
  var sheet = getSheetFor('mail');
  var idx = findRowById(sheet, MAIL_COL.id, id);
  if (idx < 0) return { ok: false, error: 'Eintrag nicht gefunden.' };
  var range = sheet.getRange(idx, 1, 1, MAIL_COLS);
  var v = range.getValues()[0];
  var obj = mailRowToObj(v);
  var parts = [{ text: mailAskPrompt(obj.language || DEFAULT_LANG, q) }];
  var built = buildMailParts(id);
  if (built.text) parts.push({ text: '\n\n---\nMAIL:\n' + built.text });
  else parts.push({ text: '\n\n---\nZUSAMMENFASSUNG:\n' + (obj.summary || '') });
  for (var i = 0; i < built.files.length; i++) parts.push(built.files[i]);
  var answer = callGemini(parts);
  obj.qa = obj.qa || [];
  obj.qa.push({ q: q, a: answer, at: new Date().toISOString() });
  v[MAIL_COL.qa - 1] = JSON.stringify(obj.qa);
  range.setValues([v]);
  return { ok: true, qa: obj.qa, answer: answer };
}

/**
 * Baut aus einer Gmail-Unterhaltung den Text aller Nachrichten und die mitschickbaren Anhaenge
 * (PDF, Bilder, reiner Text) als Gemini-Teile. Wirft nie.
 * Rueckgabe: { text, files:[{inline_data}], skipped:[Dateiname] }
 */
function buildMailParts(threadId) {
  var res = { text: '', files: [], skipped: [] };
  var th;
  try { th = GmailApp.getThreadById(threadId); } catch (e) { return res; }
  if (!th) return res;
  var msgs = th.getMessages();
  var chunks = [];
  var budget = MAIL_ATTACHMENT_MAX_BYTES;
  for (var i = 0; i < msgs.length; i++) {
    var m = msgs[i];
    chunks.push('--- Nachricht ' + (i + 1) + ' von ' + msgs.length + ' ---\n' +
      'Von: ' + m.getFrom() + '\nAn: ' + m.getTo() + '\nDatum: ' + m.getDate() +
      '\nBetreff: ' + m.getSubject() + '\n\n' + (m.getPlainBody() || '').slice(0, 20000));
    var atts = [];
    try { atts = m.getAttachments({ includeInlineImages: false }); } catch (e) {}
    for (var a = 0; a < atts.length; a++) {
      var att = atts[a];
      try {
        var type = String(att.getContentType() || '').toLowerCase();
        var size = att.getSize();
        var ok = /^application\/pdf/.test(type) || /^image\//.test(type) || /^text\//.test(type);
        if (!ok || size > budget) { res.skipped.push(att.getName()); continue; }
        budget -= size;
        if (/^text\//.test(type)) {
          chunks.push('--- Anhang (Text): ' + att.getName() + ' ---\n' +
            att.getDataAsString().slice(0, 20000));
        } else {
          res.files.push({ inline_data: {
            mime_type: type.split(';')[0],
            data: Utilities.base64Encode(att.getBytes())
          } });
        }
      } catch (e) { res.skipped.push(att.getName()); }
    }
  }
  res.text = chunks.join('\n\n');
  return res;
}

// ===================== AKTIONEN: gemeinsam (alle Arten) ===================

function doTranslate(kind, id, lang) {
  if (!lang) return { ok: false, error: 'Keine Zielsprache angegeben.' };
  var kc = cfgFor(kind), C = kc.COL;
  var sheet = getSheetFor(kind);
  var idx = findRowById(sheet, C.id, id);
  if (idx < 0) return { ok: false, error: 'Eintrag nicht gefunden.' };
  var range = sheet.getRange(idx, 1, 1, kc.COLS);
  var v = range.getValues()[0];
  var obj = rowToObjFor(kind, v);
  if (obj.status !== 'done' || !obj.summary) {
    return { ok: false, error: 'Noch keine Zusammenfassung vorhanden.' };
  }
  if (obj.language === lang) return { ok: true, lang: lang, text: obj.summary, cached: true };
  if (obj.translations && obj.translations[lang]) {
    return { ok: true, lang: lang, text: obj.translations[lang], cached: true };
  }
  var translated = callGemini([{ text: translatePrompt(lang) + '\n\n' + obj.summary }]);
  obj.translations[lang] = translated;
  v[C.translations - 1] = JSON.stringify(obj.translations);
  range.setValues([v]);
  return { ok: true, lang: lang, text: translated, cached: false };
}

function doRetry(kind, id) {
  ensureTrigger();
  var kc = cfgFor(kind), C = kc.COL;
  var sheet = getSheetFor(kind);
  var idx = findRowById(sheet, C.id, id);
  if (idx < 0) return { ok: false, error: 'Eintrag nicht gefunden.' };
  var range = sheet.getRange(idx, 1, 1, kc.COLS);
  var v = range.getValues()[0];
  v[C.status - 1] = 'pending';
  v[C.error - 1] = '';
  range.setValues([v]);
  return { ok: true };
}

/** Merkt, ob ein Eintrag als gelesen/erledigt markiert ist. */
function doSetRead(kind, id, wert) {
  var kc = cfgFor(kind);
  var sheet = getSheetFor(kind);
  ensureColumnsFor(sheet, kc.COLS);
  var idx = findRowById(sheet, kc.COL.id, id);
  if (idx < 0) return { ok: false, error: 'Eintrag nicht gefunden.' };
  sheet.getRange(idx, kc.COL.read).setValue(wert ? 'ja' : '');
  return { ok: true, read: !!wert };
}

/**
 * Durchsucht die vollstaendigen Zusammenfassungen auf dem Server (auch die Texte, die das
 * Handy noch nie geladen hat). Liefert nur die Trefferliste an IDs zurueck – das ist klein.
 */
function doSearch(kind, q) {
  q = String(q || '').trim().toLowerCase();
  if (q.length < 2) return { ok: false, error: 'Bitte mindestens 2 Zeichen eingeben.' };
  var kc = cfgFor(kind);
  var sheet = getSheetFor(kind);
  var last = sheet.getLastRow();
  if (last < 2) return { ok: true, ids: [] };
  var n = last - 1;
  var ids = sheet.getRange(2, kc.COL.id, n, 1).getValues();
  var sums = sheet.getRange(2, kc.COL.summary, n, 1).getValues();
  var tags = sheet.getRange(2, kc.COL.tags, n, 1).getValues();
  var begriffe = q.split(/\s+/);
  var treffer = [];
  for (var i = 0; i < n; i++) {
    if (!ids[i][0]) continue;
    var heu = (String(sums[i][0] || '') + ' ' + String(tags[i][0] || '')).toLowerCase();
    if (!heu) continue;
    var alle = true;
    for (var j = 0; j < begriffe.length; j++) {
      if (heu.indexOf(begriffe[j]) < 0) { alle = false; break; }
    }
    if (alle) treffer.push(String(ids[i][0]));
  }
  return { ok: true, ids: treffer };
}

function doDelete(kind, id) {
  var kc = cfgFor(kind), C = kc.COL;
  var sheet = getSheetFor(kind);
  var idx = findRowById(sheet, C.id, id);
  if (idx < 0) return { ok: false, error: 'Eintrag nicht gefunden.' };
  sheet.deleteRow(idx);
  return { ok: true };
}

/** Beantwortet eine gezielte Frage zum Video (Gemini sieht sich das Video dafuer an). */
function doAskYt(id, q) {
  q = String(q || '').trim();
  if (!q) return { ok: false, error: 'Keine Frage angegeben.' };
  var sheet = getSheetFor('yt');
  var idx = findRowById(sheet, COL.id, id);
  if (idx < 0) return { ok: false, error: 'Eintrag nicht gefunden.' };
  var range = sheet.getRange(idx, 1, 1, COLS);
  var v = range.getValues()[0];
  var obj = ytRowToObj(v);
  var videoPart = { file_data: { file_uri: obj.url } };
  var fps = chooseFps(obj.durationSeconds);
  if (fps > 0) videoPart.video_metadata = { fps: fps };
  var answer = callGemini([
    { text: askPrompt(obj.language || DEFAULT_LANG, q) },
    videoPart
  ]);
  obj.qa = obj.qa || [];
  obj.qa.push({ q: q, a: answer, at: new Date().toISOString() });
  v[COL.qa - 1] = JSON.stringify(obj.qa);
  range.setValues([v]);
  return { ok: true, qa: obj.qa, answer: answer };
}

/** Beantwortet eine Frage zum Artikel (laedt den Artikeltext dafuer erneut). */
function doAskNews(id, q) {
  q = String(q || '').trim();
  if (!q) return { ok: false, error: 'Keine Frage angegeben.' };
  var sheet = getSheetFor('news');
  var idx = findRowById(sheet, NEWS_COL.id, id);
  if (idx < 0) return { ok: false, error: 'Eintrag nicht gefunden.' };
  var range = sheet.getRange(idx, 1, 1, NEWS_COLS);
  var v = range.getValues()[0];
  var obj = newsRowToObj(v);
  var art = fetchArticle(obj.url);
  var context = (art.text && art.text.length >= 200)
    ? ('Titel: ' + (obj.title || art.meta.title || '') + '\nQuelle: ' + (obj.source || art.meta.source || '') +
       '\n\n' + art.text.slice(0, 45000))
    : (obj.summary || '');
  var answer = callGemini([{ text: newsAskPrompt(obj.language || DEFAULT_LANG, q) + '\n\n---\nARTIKEL:\n' + context }]);
  obj.qa = obj.qa || [];
  obj.qa.push({ q: q, a: answer, at: new Date().toISOString() });
  v[NEWS_COL.qa - 1] = JSON.stringify(obj.qa);
  range.setValues([v]);
  return { ok: true, qa: obj.qa, answer: answer };
}

// ====================== HINTERGRUND-VERARBEITUNG =========================

/** Minuten-Trigger: holt markierte Mails und arbeitet je Lauf ein Element pro Art ab. */
function processPending() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // anderer Lauf aktiv – nicht stoeren
  try {
    try { ingestMail(); } catch (e) {}     // in Gmail markierte Mails uebernehmen
    try { ingestPlaylist(); } catch (e) {} // Videos aus der YouTube-Playlist uebernehmen
    var getan = 0;
    getan += processOneFor('mail'); // Mails sind schnell (Text) -> zuerst
    getan += processOneFor('news'); // dann Artikel
    getan += processOneFor('yt');   // Video ist der teure Aufruf
    // Nur wenn gerade nichts Neues anliegt: Kennzahlen und Schlagworte nachtragen
    if (!getan && !backfillStats()) backfillTags();
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

function processOneFor(kind) {
  var kc = cfgFor(kind);
  var sheet = getSheetFor(kind);
  ensureColumnsFor(sheet, kc.COLS);
  recoverStuckFor(sheet, kc.COL, kc.COLS, kind);
  var rowIdx = findFirstByStatus(sheet, kc.COL.status, 'pending');
  if (rowIdx > 0) {
    if (kind === 'mail') processRowMail(sheet, rowIdx);
    else if (kind === 'news') processRowNews(sheet, rowIdx);
    else processRowYt(sheet, rowIdx);
    SpreadsheetApp.flush();
    return 1;
  }
  return 0;
}

/**
 * Ergaenzt Schlagworte bei Eintraegen, die vor der Schlagwort-Funktion entstanden sind.
 * Pro Lauf genau EINER – so fuellt sich das Archiv im Minutentakt von selbst auf,
 * ohne Kontingente zu belasten oder neue Zusammenfassungen auszubremsen.
 */
/**
 * Traegt Datum/Aufrufe/Likes/Kommentare bei aelteren Videos nach – die gab es erst, seit der
 * YouTube-Dienst freigegeben ist. Laeuft nur im Leerlauf und immer nur einen Eintrag pro Runde.
 */
function backfillStats() {
  if (typeof YouTube === 'undefined') return false;
  var sheet = getSheetFor('yt');
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var n = last - 1;
  var ids = sheet.getRange(2, COL.id, n, 1).getValues();
  var views = sheet.getRange(2, COL.viewCount, n, 1).getValues();
  var status = sheet.getRange(2, COL.status, n, 1).getValues();
  var fehlend = [];
  for (var i = n - 1; i >= 0 && fehlend.length < 40; i--) {     // neueste zuerst
    if (status[i][0] !== 'done' && status[i][0] !== 'error') continue;
    if (views[i][0] !== '' && views[i][0] != null) continue;
    if (!ids[i][0]) continue;
    fehlend.push({ reihe: i + 2, id: String(ids[i][0]) });
  }
  if (!fehlend.length) return false;
  try {
    var liste = fehlend.map(function (x) { return x.id; }).join(',');
    var res = YouTube.Videos.list('snippet,statistics,contentDetails', { id: liste, maxResults: 50 });
    var treffer = {};
    ((res && res.items) || []).forEach(function (it) { treffer[it.id] = it; });
    for (var f = 0; f < fehlend.length; f++) {
      var it2 = treffer[fehlend[f].id];
      if (!it2) continue;
      var meta = { title: '', channel: '', durationSeconds: 0, durationText: '' };
      uebernehmeVideoDaten(meta, it2);
      var reihe = fehlend[f].reihe;
      var rng = sheet.getRange(reihe, 1, 1, COLS);
      var v = rng.getValues()[0];
      if (meta.publishedAt) v[COL.publishedAt - 1] = meta.publishedAt;
      if (meta.viewCount != null) v[COL.viewCount - 1] = meta.viewCount;
      if (meta.likeCount != null) v[COL.likeCount - 1] = meta.likeCount;
      if (meta.commentCount != null) v[COL.commentCount - 1] = meta.commentCount;
      if (meta.durationSeconds && !v[COL.durationSeconds - 1]) {
        v[COL.durationSeconds - 1] = meta.durationSeconds;
        try { sheet.getRange(reihe, COL.durationText).setNumberFormat('@'); } catch (e) {}
        v[COL.durationText - 1] = meta.durationText;
      }
      rng.setValues([v]);
    }
    SpreadsheetApp.flush();
    return true;
  } catch (e) {}
  return false;
}

function backfillTags() {
  for (var ki = 0; ki < KINDS.length; ki++) {
    var kind = KINDS[ki];
    var kc = cfgFor(kind);
    var sheet = getSheetFor(kind);
    var last = sheet.getLastRow();
    if (last < 2) continue;
    var n = last - 1;
    var status = sheet.getRange(2, kc.COL.status, n, 1).getValues();
    var tags = sheet.getRange(2, kc.COL.tags, n, 1).getValues();
    for (var i = n - 1; i >= 0; i--) {           // neueste zuerst
      if (status[i][0] !== 'done') continue;
      if (parseTags(tags[i][0]).length) continue;
      var reihe = i + 2;
      var text = String(sheet.getRange(reihe, kc.COL.summary).getValue() || '');
      if (text.length < 50) continue;
      try {
        var antwort = callGemini([{ text:
          'Lies die folgende Zusammenfassung und gib AUSSCHLIESSLICH 3 bis 5 kurze, allgemeine ' +
          'Themen-Schlagworte auf Deutsch zurueck, mit Komma getrennt, ohne weitere Worte ' +
          '(z. B.: Politik, Wirtschaft, E-Auto). Nutze gaengige, wiederverwendbare Begriffe.\n\n' +
          text.slice(0, 6000) }]);
        var liste = String(antwort).replace(/^\s*TAGS?\s*:/i, '')
          .split(',').map(function (x) { return x.trim().replace(/^[#*\-\s]+|[.\s]+$/g, ''); })
          .filter(Boolean).slice(0, 5);
        if (liste.length) {
          sheet.getRange(reihe, kc.COL.tags).setValue(JSON.stringify(liste));
          SpreadsheetApp.flush();
        }
      } catch (e) {}
      return true;   // nur einer pro Lauf
    }
  }
  return false;
}

/**
 * Rettet Eintraege, die in 'processing' haengen geblieben sind: zurueck auf 'pending',
 * oder nach MAX_ATTEMPTS auf 'error'. Sicher, da hier das Lock gehalten wird.
 */
function recoverStuckFor(sheet, C, cols, kind) {
  var last = sheet.getLastRow();
  if (last < 2) return;
  var rng = sheet.getRange(2, 1, last - 1, cols);
  var vals = rng.getValues();
  var changed = false;
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][C.status - 1] !== 'processing') continue;
    var tr = {};
    try { tr = JSON.parse(vals[i][C.translations - 1] || '{}'); } catch (e) {}
    if ((tr._attempts || 0) >= MAX_ATTEMPTS) {
      vals[i][C.status - 1] = 'error';
      vals[i][C.error - 1] = (kind === 'mail')
        ? 'Verarbeitung mehrfach abgebrochen – die Mail ist vermutlich sehr umfangreich ' +
          '(langer Verlauf oder grosse Anhaenge). Tipp: einzelne Mail statt ganzem Verlauf ' +
          'markieren.'
        : (kind === 'news')
        ? 'Verarbeitung mehrfach abgebrochen – der Artikel liess sich nicht zuverlaessig lesen ' +
          '(evtl. sehr lang, Bezahlschranke oder per JavaScript geladen). Tipp: den direkten ' +
          'Artikel-Link der Original-Website teilen.'
        : 'Verarbeitung mehrfach abgebrochen – das Video ist vermutlich zu lang fuer das ' +
          '6-Minuten-Limit von Apps Script. Tipp: kuerzeres Video, oder VIDEO_FPS im Skript auf ' +
          'z. B. 0.2 setzen und erneut versuchen.';
      vals[i][C.processedAt - 1] = new Date().toISOString();
    } else {
      vals[i][C.status - 1] = 'pending';
    }
    changed = true;
  }
  if (changed) { rng.setValues(vals); SpreadsheetApp.flush(); }
}

function processRowYt(sheet, rowIdx) {
  var range = sheet.getRange(rowIdx, 1, 1, COLS);
  var v = range.getValues()[0];
  var obj = ytRowToObj(v);

  // Versuch zaehlen (im translations-Feld) und auf 'processing' setzen – VOR dem Gemini-Aufruf,
  // damit der Zaehler auch bei einem Abbruch (6-Min-Limit) erhalten bleibt.
  obj.translations = obj.translations || {};
  obj.translations._attempts = (obj.translations._attempts || 0) + 1;
  v[COL.status - 1] = 'processing';
  v[COL.translations - 1] = JSON.stringify(obj.translations);
  range.setValues([v]);
  SpreadsheetApp.flush();

  // 1) Metadaten (best effort – wirft nie)
  var meta = fetchMetadata(obj.url, obj.id);
  v = range.getValues()[0];
  v[COL.title - 1] = meta.title;
  v[COL.channel - 1] = meta.channel;
  v[COL.durationSeconds - 1] = meta.durationSeconds;
  // "14:06" wuerde die Tabelle als Uhrzeit deuten und als Datum zurueckgeben -> Spalte auf Text
  try { sheet.getRange(rowIdx, COL.durationText).setNumberFormat('@'); } catch (e) {}
  v[COL.durationText - 1] = meta.durationText;
  if (meta.thumbnail) v[COL.thumbnail - 1] = meta.thumbnail;
  v[COL.publishedAt - 1] = meta.publishedAt || '';
  v[COL.viewCount - 1] = meta.viewCount || '';
  v[COL.likeCount - 1] = meta.likeCount || '';
  v[COL.commentCount - 1] = meta.commentCount || '';
  range.setValues([v]);
  SpreadsheetApp.flush();

  // 2) Zusammenfassung. Liegt eigener Text vor (z. B. ein Transkript, weil Gemini das Video
  //    nicht auswerten durfte), wird DIESER zusammengefasst statt des Videos.
  try {
    var eigener = String(v[COL.input - 1] || '').trim();
    if (eigener) {
      var sumT = callGemini([{ text: textSummaryPrompt(obj.language || DEFAULT_LANG) +
                               '\n\n---\nTEXT:\n' + eigener.slice(0, 200000) }]);
      var gt = splitTags(sumT);
      v = range.getValues()[0];
      v[COL.status - 1] = 'done';
      v[COL.summary - 1] = gt.text;
      v[COL.tags - 1] = JSON.stringify(gt.tags);
      v[COL.error - 1] = '';
      v[COL.processedAt - 1] = new Date().toISOString();
      range.setValues([v]);
      return;
    }
    var videoPart = { file_data: { file_uri: obj.url } };
    var fps = chooseFps(meta.durationSeconds);
    if (fps > 0) videoPart.video_metadata = { fps: fps };
    var summary = callGemini([
      { text: summaryPrompt(obj.language || DEFAULT_LANG) },
      videoPart
    ]);
    var geteilt = splitTags(summary);
    v = range.getValues()[0];
    v[COL.status - 1] = 'done';
    v[COL.summary - 1] = geteilt.text;
    v[COL.tags - 1] = JSON.stringify(geteilt.tags);
    v[COL.error - 1] = '';
    v[COL.processedAt - 1] = new Date().toISOString();
    range.setValues([v]);
  } catch (err) {
    v = range.getValues()[0];
    // Geminis Sammelmeldung "OTHER" ist oft eine Eintagsfliege: einmal still neu versuchen,
    // bevor der Eintrag als Fehler in der Liste steht.
    var nochmal = /OTHER|Sammelmeldung/i.test(String(err)) && (obj.translations._attempts || 0) < 2;
    v[COL.status - 1] = nochmal ? 'pending' : 'error';
    v[COL.error - 1] = nochmal ? '' : String(err).slice(0, 500);
    v[COL.processedAt - 1] = new Date().toISOString();
    range.setValues([v]);
  }
}

function processRowNews(sheet, rowIdx) {
  var C = NEWS_COL;
  var range = sheet.getRange(rowIdx, 1, 1, NEWS_COLS);
  var v = range.getValues()[0];
  var obj = newsRowToObj(v);

  obj.translations = obj.translations || {};
  obj.translations._attempts = (obj.translations._attempts || 0) + 1;
  v[C.status - 1] = 'processing';
  v[C.translations - 1] = JSON.stringify(obj.translations);
  range.setValues([v]);
  SpreadsheetApp.flush();

  try {
    var eigenerN = String(v[C.input - 1] || '').trim();
    if (eigenerN) {
      var sumN = callGemini([{ text: textSummaryPrompt(obj.language || DEFAULT_LANG) +
                               '\n\n---\nTEXT:\n' + eigenerN.slice(0, 200000) }]);
      var gN = splitTags(sumN);
      v = range.getValues()[0];
      v[C.status - 1] = 'done';
      v[C.summary - 1] = gN.text;
      v[C.tags - 1] = JSON.stringify(gN.tags);
      v[C.error - 1] = '';
      v[C.processedAt - 1] = new Date().toISOString();
      range.setValues([v]);
      return;
    }
    var art = fetchArticle(obj.url);
    // Metadaten + ggf. aufgeloeste Original-URL uebernehmen
    v = range.getValues()[0];
    if (art.url && art.url !== obj.url) v[C.url - 1] = art.url;
    if (art.meta.title) v[C.title - 1] = art.meta.title;
    v[C.source - 1] = art.meta.source || v[C.source - 1] || domainOf(obj.url);
    if (art.meta.image) v[C.image - 1] = art.meta.image;
    if (art.meta.publishedAt) v[C.publishedAt - 1] = art.meta.publishedAt;
    if (art.meta.author) v[C.author - 1] = art.meta.author;
    range.setValues([v]);
    SpreadsheetApp.flush();

    if (!art.text || art.text.length < 200) {
      throw new Error('Konnte den Text dieser Seite nicht lesen – auch nicht ueber den ' +
        'Reader-Fallback. Moegliche Gruende: Anmeldung/Bezahlschranke noetig, die Seite blockt ' +
        'automatisierte Zugriffe komplett, oder der Reader-Dienst war kurz nicht erreichbar. ' +
        'Tipp: spaeter erneut versuchen oder einen anderen (direkten) Link derselben Quelle nehmen.');
    }
    var text = art.text.slice(0, 45000);
    var head = 'Titel: ' + (art.meta.title || '') + '\nQuelle: ' + (art.meta.source || '') +
      (art.meta.publishedAt ? ('\nDatum: ' + art.meta.publishedAt) : '') + '\n\n';
    var summary = callGemini([{ text: newsSummaryPrompt(obj.language || DEFAULT_LANG) + '\n\n---\nARTIKEL:\n' + head + text }]);
    var geteilt = splitTags(summary);
    v = range.getValues()[0];
    v[C.status - 1] = 'done';
    v[C.summary - 1] = geteilt.text;
    v[C.tags - 1] = JSON.stringify(geteilt.tags);
    v[C.error - 1] = '';
    v[C.processedAt - 1] = new Date().toISOString();
    range.setValues([v]);
  } catch (err) {
    v = range.getValues()[0];
    v[C.status - 1] = 'error';
    v[C.error - 1] = String(err).slice(0, 500);
    v[C.processedAt - 1] = new Date().toISOString();
    range.setValues([v]);
  }
}

function processRowMail(sheet, rowIdx) {
  var C = MAIL_COL;
  var range = sheet.getRange(rowIdx, 1, 1, MAIL_COLS);
  var v = range.getValues()[0];
  var obj = mailRowToObj(v);

  obj.translations = obj.translations || {};
  obj.translations._attempts = (obj.translations._attempts || 0) + 1;
  v[C.status - 1] = 'processing';
  v[C.translations - 1] = JSON.stringify(obj.translations);
  range.setValues([v]);
  SpreadsheetApp.flush();

  try {
    var built = buildMailParts(obj.id);
    if (!built.text) {
      throw new Error('Die Mail konnte nicht gelesen werden. Moeglicherweise wurde die ' +
        'Unterhaltung in Gmail geloescht oder verschoben.');
    }
    var parts = [{ text: mailSummaryPrompt(obj.language || DEFAULT_LANG, built.files.length) },
                 { text: '\n\n---\nMAIL:\n' + built.text.slice(0, 45000) }];
    for (var i = 0; i < built.files.length; i++) parts.push(built.files[i]);
    var summary = callGemini(parts);
    var geteilt = splitTags(summary);
    var text2 = geteilt.text;
    if (built.skipped.length) {
      text2 += '\n\n---\n*Nicht ausgewertete Anhaenge (Format oder Groesse): ' +
        built.skipped.join(', ') + '*';
    }
    v = range.getValues()[0];
    v[C.status - 1] = 'done';
    v[C.summary - 1] = text2;
    v[C.tags - 1] = JSON.stringify(geteilt.tags);
    v[C.error - 1] = '';
    v[C.processedAt - 1] = new Date().toISOString();
    range.setValues([v]);
  } catch (err) {
    v = range.getValues()[0];
    v[C.status - 1] = 'error';
    v[C.error - 1] = String(err).slice(0, 500);
    v[C.processedAt - 1] = new Date().toISOString();
    range.setValues([v]);
  }
}

/**
 * Waehlt die Bildrate (fps). VIDEO_FPS>0 erzwingt einen festen Wert; sonst automatisch:
 * bei langen Videos weniger Bilder, damit das 1-Mio-Token-Limit eingehalten wird.
 * Rueckgabe 0 = Standard des Modells (1 fps) verwenden.
 */
function chooseFps(durationSeconds) {
  if (VIDEO_FPS > 0) return VIDEO_FPS;
  var dur = parseInt(durationSeconds, 10) || 0;
  if (dur <= 3600) return 0;                    // bis 1 Std.: Standard (1 fps) reicht
  var budget = 700000;                          // Sicherheitsabstand unter 1.048.576 Tokens
  var fps = (budget - 32 * dur) / (66 * dur);   // ~66 Tokens/Bild + ~32/Sek Audio (low res)
  if (fps >= 1) return 0;
  if (fps < 0.1) fps = 0.1;
  return Math.round(fps * 100) / 100;
}

// =============================== GEMINI ===================================

function callGemini(parts) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.indexOf('HIER_') === 0) {
    throw new Error('Kein Gemini-API-Schluessel hinterlegt. Im Apps Script einmal ' +
      'zugangsdatenSetzen() ausfuehren.');
  }
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    MODEL + ':generateContent?key=' + encodeURIComponent(GEMINI_API_KEY);
  // Medienaufloesung nur fuer Videos setzen (spart dort Tokens). Bei Anhaengen (PDF/Bild) wuerde
  // sie nur die Lesbarkeit verschlechtern, bei reinem Text ist sie ohnehin wirkungslos.
  var hasVideo = parts.some(function (pt) { return pt && pt.file_data; });

  function bauePayload(denkBudget) {
    var gen = { maxOutputTokens: MAX_OUTPUT_TOKENS };
    if (MEDIA_RESOLUTION && hasVideo) gen.mediaResolution = MEDIA_RESOLUTION;
    if (denkBudget >= 0) gen.thinkingConfig = { thinkingBudget: denkBudget };
    return JSON.stringify({ contents: [{ parts: parts }], generationConfig: gen });
  }

  // Erst mit dem eingestellten Denk-Budget; kommt eine leere Antwort zurueck, einmal mit
  // abgeschaltetem Denken nachfassen (dann bleibt das ganze Budget fuer den Text uebrig).
  var budgets = (THINKING_BUDGET === 0) ? [0] : [THINKING_BUDGET, 0];
  var letzterFehler = null;
  for (var b = 0; b < budgets.length; b++) {
    try {
      return geminiVersuch(url, bauePayload(budgets[b]));
    } catch (err) {
      letzterFehler = err;
      if (!/LEERE_ANTWORT/.test(String(err && err.message))) throw err;
    }
  }
  throw new Error(String(letzterFehler && letzterFehler.message || '').replace(/^LEERE_ANTWORT:\s*/, ''));
}

/**
 * Ein Gemini-Aufruf samt Wiederholung bei voruebergehenden Fehlern.
 * 429 (Kontingent) und 5xx (ueberlastet) sind fast immer nach ein paar Sekunden weg – frueher
 * wurde der Eintrag dafuer sofort auf "Fehler" gesetzt und blieb liegen.
 */
function geminiVersuch(url, payload) {
  var wartezeiten = [2000, 8000, 20000];   // Summe unter dem 6-Minuten-Limit von Apps Script
  for (var versuch = 0; versuch <= GEMINI_RETRIES; versuch++) {
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: payload,
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var body = res.getContentText();

    if (code === 429 || code >= 500) {
      if (versuch < GEMINI_RETRIES) {
        Utilities.sleep(wartezeiten[Math.min(versuch, wartezeiten.length - 1)]);
        continue;
      }
      var wartMsg = shortErr(body);
      throw new Error(code === 429
        ? ('Gemini-Kontingent erschoepft (HTTP 429) – auch nach ' + (GEMINI_RETRIES + 1) +
           ' Versuchen. ' + wartMsg)
        : ('Gemini ueberlastet (HTTP ' + code + ') – auch nach ' + (GEMINI_RETRIES + 1) +
           ' Versuchen. ' + wartMsg));
    }

    if (code !== 200) {
      var msg = shortErr(body);
      if (/token count|maximum number of tokens|exceeds the maximum/i.test(msg)) {
        throw new Error('Der Inhalt ist zu lang fuer die Gratis-Stufe (Token-Limit). Bei Videos: ' +
          'VIDEO_FPS im Skript z. B. auf 0.5 setzen. Bei Artikeln: sehr lange Texte werden gekuerzt.');
      }
      if (code === 403) {
        throw new Error('Gemini-Fehler HTTP 403: ' + msg + ' – Der API-Schluessel greift nicht. ' +
          'Pruefe in der Google Cloud Console unter "Anmeldedaten", ob beim Schluessel die ' +
          '"Anwendungseinschraenkungen" auf KEINE stehen und die "Generative Language API" ' +
          'erlaubt und im Projekt aktiviert ist.');
      }
      throw new Error('Gemini-Fehler HTTP ' + code + ': ' + msg);
    }

    var data = JSON.parse(body);
    if (data.promptFeedback && data.promptFeedback.blockReason) {
      throw new Error(blockErklaerung(data.promptFeedback.blockReason));
    }
    var cand = data.candidates && data.candidates[0];
    if (!cand) throw new Error('Keine Antwort von Gemini erhalten.');
    var text = ((cand.content && cand.content.parts) || [])
      .map(function (p) { return p.text || ''; }).join('').trim();
    if (text) return text;

    // Antwort ohne Text: Der Aufrufer entscheidet, ob er es ohne Denk-Budget erneut versucht.
    var grund = cand.finishReason || 'unbekannt';
    if (grund === 'MAX_TOKENS' || grund === 'STOP') {
      throw new Error('LEERE_ANTWORT: Gemini hat geantwortet, aber keinen Text geliefert ' +
        '(finishReason ' + grund + '). Bei sehr langen Videos hilft ein kleinerer VIDEO_FPS-Wert, ' +
        'sonst der Weg ueber "Eigener Text" in der App.');
    }
    throw new Error(blockErklaerung(grund));
  }
  throw new Error('Gemini nicht erreichbar.');
}

/**
 * Uebersetzt Geminis knappe Fehlerkuerzel in eine Erklaerung, mit der man etwas anfangen kann.
 * "OTHER" ist Geminis Sammelbegriff: Es sagt bewusst nicht, woran es lag. Bei Videos steckt
 * fast immer dahinter, dass Gemini das Video nicht abspielen konnte oder nicht auswerten wollte.
 */
function blockErklaerung(grund) {
  var g = String(grund || '').toUpperCase();
  if (g === 'SAFETY' || g === 'PROHIBITED_CONTENT') {
    return 'Gemini hat den Inhalt als heikel eingestuft und die Zusammenfassung verweigert.';
  }
  if (g === 'RECITATION') {
    return 'Gemini hat abgebrochen, weil die Antwort zu woertlich aus einer geschuetzten Quelle stammen wuerde.';
  }
  if (g === 'OTHER' || g === 'UNBEKANNT') {
    return 'Gemini konnte dieses Video nicht auswerten (Sammelmeldung "OTHER"). Haeufige Gruende: ' +
      'nicht oeffentlich oder nur mit Link, Altersbeschraenkung, Laendersperre, laufender Livestream, ' +
      'reine Musik/Auto-Untertitel oder ein sehr langes Video. Mit "Erneut versuchen" klappt es ' +
      'manchmal im zweiten Anlauf.';
  }
  return 'Von Gemini abgelehnt (' + grund + ').';
}

function shortErr(body) {
  try {
    var d = JSON.parse(body);
    if (d.error && d.error.message) return d.error.message;
  } catch (e) {}
  return String(body).slice(0, 300);
}

/** Wird an jeden Zusammenfassungs-Prompt angehaengt: erzeugt die Schlagworte. */
var TAGS_HINWEIS =
  'Schliesse mit einer allerletzten Zeile in genau diesem Format:\n' +
  'TAGS: schlagwort1, schlagwort2, schlagwort3\n' +
  'Das sind 3 bis 5 kurze, allgemeine Themen-Schlagworte, IMMER auf Deutsch (auch wenn der ' +
  'Text in einer anderen Sprache ist), z. B. Politik, Wirtschaft, E-Auto, Gesundheit, KI. ' +
  'Verwende moeglichst gaengige, wiederverwendbare Begriffe statt sehr spezifischer.';

function summaryPrompt(lang) {
  return 'Du bist ein praeziser Assistent, der YouTube-Videos zusammenfasst. ' +
    'Sieh dir das verlinkte Video an und fasse seinen Inhalt auf ' + lang + ' zusammen. ' +
    'Gib AUSSCHLIESSLICH Markdown in genau dieser Struktur zurueck, ohne einleitende Worte:\n\n' +
    '**TL;DR:** <ein bis zwei Saetze, worum es geht>\n\n' +
    '## Kernaussagen\n- <5 bis 8 praegnante Stichpunkte>\n\n' +
    '## Ausfuehrliche Zusammenfassung\n<mehrere Absaetze, die den Inhalt verstaendlich und ' +
    'vollstaendig wiedergeben; nutze bei Bedarf Zwischenueberschriften>\n\n' +
    '## Wichtige Details\n- <relevante Zahlen, Namen, Tipps, Schritte oder Links, falls im Video vorhanden>\n\n' +
    'Schreibe sachlich und ohne Wiederholungen. Wenn das Video kaum verwertbaren Inhalt hat, sage das ehrlich.\n\n' +
    TAGS_HINWEIS;

}

/**
 * Fuer selbst eingefuegten Text (Transkript, Notizen, kopierter Artikel). Bewusst neutral
 * formuliert, weil die Quelle alles Moegliche sein kann.
 */
function textSummaryPrompt(lang) {
  return 'Du bist ein praeziser Assistent. Fasse den unten stehenden Text auf ' + lang + ' zusammen. ' +
    'Stuetze dich AUSSCHLIESSLICH auf den gegebenen Text und erfinde nichts dazu. Der Text kann ein ' +
    'Transkript, ein Artikel oder eine Notiz sein und unsauber formatiert sein (Zeitstempel, ' +
    'Zeilenumbrueche mitten im Satz) - ignoriere solche Stoerungen. Gib AUSSCHLIESSLICH Markdown in ' +
    'genau dieser Struktur zurueck, ohne einleitende Worte:\n\n' +
    '**TL;DR:** <ein bis zwei Saetze, worum es geht>\n\n' +
    '## Kernaussagen\n- <5 bis 8 praegnante Stichpunkte>\n\n' +
    '## Ausfuehrliche Zusammenfassung\n<mehrere Absaetze, die den Inhalt verstaendlich und ' +
    'vollstaendig wiedergeben; nutze bei Bedarf Zwischenueberschriften>\n\n' +
    '## Wichtige Details\n- <relevante Zahlen, Namen, Zitate, Schritte oder Fakten>\n\n' +
    'Schreibe sachlich und ohne Wiederholungen.\n\n' +
    TAGS_HINWEIS;
}

function newsSummaryPrompt(lang) {
  return 'Du bist ein praeziser Assistent, der Nachrichtenartikel zusammenfasst. ' +
    'Fasse den unten stehenden Artikel auf ' + lang + ' zusammen. Stuetze dich AUSSCHLIESSLICH auf den ' +
    'gegebenen Text und erfinde nichts dazu. Gib AUSSCHLIESSLICH Markdown in genau dieser Struktur ' +
    'zurueck, ohne einleitende Worte:\n\n' +
    '**TL;DR:** <ein bis zwei Saetze, worum es geht>\n\n' +
    '## Kernpunkte\n- <4 bis 7 praegnante Stichpunkte>\n\n' +
    '## Ausfuehrliche Zusammenfassung\n<mehrere Absaetze, die den Artikel verstaendlich und ' +
    'vollstaendig wiedergeben; nutze bei Bedarf Zwischenueberschriften>\n\n' +
    '## Wichtige Details\n- <relevante Zahlen, Namen, Zitate, Daten oder Fakten aus dem Artikel>\n\n' +
    'Schreibe sachlich und ohne Wiederholungen. Wenn der Text kaum verwertbaren Inhalt hat ' +
    '(z. B. nur Navigation oder eine Bezahlschranke), sage das ehrlich.\n\n' +
    TAGS_HINWEIS;
}

function mailSummaryPrompt(lang, attachmentCount) {
  return 'Du bist ein praeziser Assistent, der E-Mails zusammenfasst. Fasse die unten stehende ' +
    'Mail-Unterhaltung auf ' + lang + ' zusammen' +
    (attachmentCount ? ' und beziehe die ' + attachmentCount + ' beigefuegten Anhaenge mit ein' : '') +
    '. Stuetze dich AUSSCHLIESSLICH auf den gegebenen Inhalt und erfinde nichts dazu. ' +
    'Gib AUSSCHLIESSLICH Markdown in genau dieser Struktur zurueck, ohne einleitende Worte:\n\n' +
    '**TL;DR:** <ein bis zwei Saetze, worum es geht>\n\n' +
    '## Kernpunkte\n- <3 bis 7 praegnante Stichpunkte>\n\n' +
    '## Worum es geht\n<mehrere Absaetze; bei mehreren Nachrichten den Verlauf nachvollziehbar ' +
    'wiedergeben: wer schreibt was und warum>\n\n' +
    (attachmentCount ? '## Anhaenge\n- <je Anhang: was er enthaelt, wichtigste Inhalte/Zahlen>\n\n' : '') +
    '## Was zu tun ist\n- <konkrete Aufgaben, Fristen, Termine oder Zusagen; wenn nichts zu tun ' +
    'ist, schreibe "Nichts zu tun.">\n\n' +
    'Schreibe sachlich und ohne Wiederholungen. Ignoriere Signaturen, Haftungsausschluesse und ' +
    'automatische Fusszeilen.\n\n' +
    TAGS_HINWEIS;

}

function translatePrompt(lang) {
  return 'Uebersetze den folgenden Markdown-Text vollstaendig und natuerlich nach ' + lang + '. ' +
    'Behalte die Markdown-Struktur (Ueberschriften, Listen, Fettungen) exakt bei. ' +
    'Gib nur die Uebersetzung zurueck, ohne Kommentar.';
}

function askPrompt(lang, q) {
  return 'Du beantwortest eine gezielte Frage zum verlinkten YouTube-Video. Stuetze dich auf ' +
    'den Videoinhalt. Antworte praezise und knapp auf ' + lang + ' (kurze Absaetze oder ' +
    'Stichpunkte, Markdown erlaubt). Wenn die Antwort nicht aus dem Video hervorgeht, sage das ' +
    'ehrlich.\n\nFrage: ' + q;
}

function mailAskPrompt(lang, q) {
  return 'Du beantwortest eine gezielte Frage zu einer E-Mail (ggf. inkl. Anhaengen). Stuetze ' +
    'dich ausschliesslich auf den unten gegebenen Inhalt. Antworte praezise und knapp auf ' + lang +
    ' (kurze Absaetze oder Stichpunkte, Markdown erlaubt). Wenn die Antwort nicht aus der Mail ' +
    'hervorgeht, sage das ehrlich.\n\nFrage: ' + q;
}

function newsAskPrompt(lang, q) {
  return 'Du beantwortest eine gezielte Frage zu einem Nachrichtenartikel. Stuetze dich ' +
    'ausschliesslich auf den unten gegebenen Artikeltext. Antworte praezise und knapp auf ' + lang +
    ' (kurze Absaetze oder Stichpunkte, Markdown erlaubt). Wenn die Antwort nicht aus dem Artikel ' +
    'hervorgeht, sage das ehrlich.\n\nFrage: ' + q;
}

// ============================== METADATEN (YT) ===========================

/**
 * Fragt YouTubes eigene Player-Schnittstelle nach den Videodaten.
 * Das ist der zuverlaessige Weg: die normale Watch-Seite liefert Server-IPs (wie der von
 * Apps Script) inzwischen eine abgespeckte Fassung ganz ohne Aufrufe/Datum/Laenge.
 * Liefert { title, channel, durationSeconds, viewCount, publishedAt } oder null. Wirft nie.
 */
function fetchViaInnertube(videoId) {
  try {
    var payload = {
      context: { client: { clientName: 'WEB', clientVersion: '2.20240726.00.00', hl: 'de', gl: 'DE' } },
      videoId: videoId
    };
    var res = UrlFetchApp.fetch(
      'https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify(payload), muteHttpExceptions: true,
        headers: { 'User-Agent': UA, 'Accept-Language': 'de,en;q=0.8' }
      });
    if (res.getResponseCode() !== 200) return null;
    var d = JSON.parse(res.getContentText());
    var v = d.videoDetails || {};
    var m = (d.microformat && d.microformat.playerMicroformatRenderer) || {};
    var titel = v.title || ((m.title && m.title.simpleText) || '');
    if (!titel && !v.viewCount) return null;
    return {
      title: titel,
      channel: v.author || (m.ownerChannelName || ''),
      durationSeconds: parseInt(v.lengthSeconds || m.lengthSeconds || 0, 10) || 0,
      viewCount: v.viewCount || m.viewCount || '',
      publishedAt: m.publishDate || m.uploadDate || ''
    };
  } catch (e) { return null; }
}

/**
 * Holt Metadaten: zuerst YouTubes Player-Schnittstelle (Titel/Kanal/Laenge/Aufrufe/Datum),
 * dann oEmbed als Rueckfallebene fuer Titel/Kanal/Vorschaubild und – falls YT_API_KEY
 * gesetzt – exakte Werte inkl. Likes/Kommentare (YouTube Data API). Wirft nie.
 */
function fetchMetadata(url, videoId) {
  var meta = {
    title: '', channel: '', durationSeconds: 0, durationText: '',
    thumbnail: 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg',
    publishedAt: '', viewCount: '', likeCount: '', commentCount: ''
  };
  // 1) YouTubes Player-Schnittstelle – liefert Laenge, Aufrufe und Datum zuverlaessig
  var it = fetchViaInnertube(videoId);
  if (it) {
    meta.title = it.title || meta.title;
    meta.channel = it.channel || meta.channel;
    if (it.durationSeconds) {
      meta.durationSeconds = it.durationSeconds;
      meta.durationText = formatDuration(it.durationSeconds);
    }
    if (it.viewCount) meta.viewCount = it.viewCount;
    if (it.publishedAt) meta.publishedAt = it.publishedAt;
  }
  // 2) oEmbed: Titel, Kanal, Thumbnail (kein Schluessel noetig)
  try {
    var o = UrlFetchApp.fetch(
      'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url),
      { muteHttpExceptions: true });
    if (o.getResponseCode() === 200) {
      var d = JSON.parse(o.getContentText());
      if (d.title && !meta.title) meta.title = d.title;          // vorhandene Werte nicht ueberschreiben
      if (d.author_name && !meta.channel) meta.channel = d.author_name;
      if (d.thumbnail_url) meta.thumbnail = d.thumbnail_url;
    }
  } catch (e) {}
  // 3) Watch-Seite nur noch als letzte Rueckfallebene (sie ist gross und liefert Servern
  //    inzwischen meist keine Kennzahlen mehr) – daher nur, wenn noch etwas fehlt.
  if (!meta.durationSeconds || !meta.viewCount || !meta.title) {
    try {
      var w = UrlFetchApp.fetch('https://www.youtube.com/watch?v=' + videoId, {
        muteHttpExceptions: true,
        headers: { 'User-Agent': UA, 'Accept-Language': 'de,en;q=0.8' }
      });
      var html = w.getContentText();
      var m;
      if (!meta.durationSeconds && (m = html.match(/"lengthSeconds":"(\d+)"/))) {
        meta.durationSeconds = parseInt(m[1], 10);
        meta.durationText = formatDuration(meta.durationSeconds);
      }
      if (!meta.durationSeconds && (m = html.match(/itemprop="duration"[^>]*content="([^"]+)"/))) {
        meta.durationSeconds = parseIso8601Duration(m[1]);
        meta.durationText = formatDuration(meta.durationSeconds);
      }
      if (!meta.viewCount && (m = html.match(/"viewCount":"(\d+)"/))) meta.viewCount = m[1];
      if (!meta.viewCount && (m = html.match(/"interactionCount"\s*:\s*"?(\d+)/))) meta.viewCount = m[1];
      if (!meta.publishedAt && (m = html.match(/"(?:publishDate|uploadDate)":"([^"]+)"/))) meta.publishedAt = m[1];
      if (!meta.publishedAt && (m = html.match(/itemprop="(?:datePublished|uploadDate)"[^>]*content="([^"]+)"/))) meta.publishedAt = m[1];
      if (!meta.title) {
        var t = html.match(/<title>([^<]*)<\/title>/);
        if (t) meta.title = t[1].replace(/ - YouTube\s*$/, '').trim();
      }
    } catch (e) {}
  }
  // BEVORZUGT: der erweiterte YouTube-Dienst (laeuft mit deinem Konto, braucht KEINEN Schluessel).
  // Nur wenn der nicht verfuegbar ist, wird auf einen API-Schluessel zurueckgegriffen.
  var ueberDienst = false;
  if (typeof YouTube !== 'undefined') {
    try {
      var vs = YouTube.Videos.list('snippet,statistics,contentDetails', { id: videoId });
      var v0 = vs && vs.items && vs.items[0];
      if (v0) {
        uebernehmeVideoDaten(meta, v0);
        ueberDienst = true;
      }
    } catch (e) {}
  }
  // OPTIONAL: YouTube Data API mit Schluessel -> nur noch als Rueckfallebene
  if (!ueberDienst && YT_API_KEY) {
    try {
      var a = UrlFetchApp.fetch(
        'https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=' +
        encodeURIComponent(videoId) + '&key=' + encodeURIComponent(YT_API_KEY),
        { muteHttpExceptions: true });
      if (a.getResponseCode() === 200) {
        var it = (JSON.parse(a.getContentText()).items || [])[0];
        if (it) {
          if (it.snippet) {
            if (!meta.title || meta.title === '(Titel unbekannt)') meta.title = it.snippet.title || meta.title;
            if (!meta.channel) meta.channel = it.snippet.channelTitle || meta.channel;
            if (it.snippet.publishedAt) meta.publishedAt = it.snippet.publishedAt;
          }
          if (it.statistics) {
            if (it.statistics.viewCount != null) meta.viewCount = it.statistics.viewCount;
            if (it.statistics.likeCount != null) meta.likeCount = it.statistics.likeCount;
            if (it.statistics.commentCount != null) meta.commentCount = it.statistics.commentCount;
          }
          if (it.contentDetails && it.contentDetails.duration && !meta.durationSeconds) {
            meta.durationSeconds = parseIso8601Duration(it.contentDetails.duration);
            meta.durationText = formatDuration(meta.durationSeconds);
          }
        }
      }
    } catch (e) {}
  }
  if (!meta.title) meta.title = '(Titel unbekannt)';
  return meta;
}

/** Uebernimmt Titel, Kanal, Datum, Aufrufe, Likes, Kommentare und Laenge aus einem API-Treffer. */
function uebernehmeVideoDaten(meta, it) {
  if (it.snippet) {
    if (!meta.title || meta.title === '(Titel unbekannt)') meta.title = it.snippet.title || meta.title;
    if (!meta.channel) meta.channel = it.snippet.channelTitle || meta.channel;
    if (it.snippet.publishedAt) meta.publishedAt = it.snippet.publishedAt;
  }
  if (it.statistics) {
    if (it.statistics.viewCount != null) meta.viewCount = it.statistics.viewCount;
    if (it.statistics.likeCount != null) meta.likeCount = it.statistics.likeCount;
    if (it.statistics.commentCount != null) meta.commentCount = it.statistics.commentCount;
  }
  if (it.contentDetails && it.contentDetails.duration && !meta.durationSeconds) {
    meta.durationSeconds = parseIso8601Duration(it.contentDetails.duration);
    meta.durationText = formatDuration(meta.durationSeconds);
  }
}

// ============================ ARTIKEL LADEN (News) =======================

/**
 * Laedt einen Artikel: folgt Weiterleitungen, loest Google-News-Wrapper nach Moeglichkeit auf,
 * liest Metadaten (og-Tags und JSON-LD) und extrahiert den Fliesstext. Wirft nie.
 * Rueckgabe: { meta:{title,source,image,publishedAt,author,description}, text, url }
 */
function fetchArticle(url) {
  var target = url;
  if (/(^|\.)news\.google\.com/i.test(url)) target = resolveGoogleNews(url) || url;
  var meta = { title: '', source: '', image: '', publishedAt: '', author: '', description: '' };
  var finalUrl = target, html = '';
  try {
    var res = UrlFetchApp.fetch(target, {
      muteHttpExceptions: true, followRedirects: true,
      headers: { 'Accept-Language': 'de,en;q=0.8', 'User-Agent': UA }
    });
    var code = res.getResponseCode();
    if (code >= 200 && code < 400) html = res.getContentText();
  } catch (e) {}

  if (html) {
    meta.title = decodeEntities(metaProp(html, 'og:title') || metaProp(html, 'twitter:title') || titleTag(html));
    meta.source = decodeEntities(metaProp(html, 'og:site_name')) || domainOf(finalUrl);
    meta.image = metaProp(html, 'og:image') || metaProp(html, 'twitter:image');
    meta.publishedAt = metaProp(html, 'article:published_time') || jsonLd(html, 'datePublished') ||
      metaProp(html, 'og:updated_time') || metaProp(html, 'date');
    meta.author = decodeEntities(metaProp(html, 'author') || metaProp(html, 'article:author') || jsonLdAuthor(html));
    meta.description = decodeEntities(metaProp(html, 'og:description'));
    var canon = metaProp(html, 'og:url');
    if (canon && /^https?:\/\//i.test(canon) && !/news\.google\.com/i.test(canon)) finalUrl = canon;
  }
  var text = html ? htmlToText(pickContent(html)) : '';

  // FALLBACK ueber den Reader-Dienst: greift, wenn der direkte Abruf blockiert wurde
  // (Cloudflare/Consent-Wall -> Blockadeseite) oder die Seite ihren Text per JavaScript aufbaut.
  if (READER_ENDPOINT && (!text || text.length < 500 || looksBlocked(html))) {
    var reader = fetchViaReader(target);
    if (reader && reader.text && reader.text.length > (text ? text.length : 0)) {
      text = reader.text;
      if (!meta.title && reader.title) meta.title = decodeEntities(reader.title);
      if (!meta.publishedAt && reader.publishedAt) meta.publishedAt = reader.publishedAt;
      if (!meta.source) meta.source = domainOf(finalUrl);
    }
  }

  // Falls immer noch kaum Text, aber eine Beschreibung vorhanden ist: als Minimalinhalt nutzen.
  if ((!text || text.length < 200) && meta.description && meta.description.length > 120) {
    text = meta.description;
  }
  if (!meta.source) meta.source = domainOf(finalUrl);
  return { meta: meta, text: text, url: finalUrl };
}

/** Erkennt typische Blockade-/Challenge-Seiten (dann lieber ueber den Reader gehen). */
function looksBlocked(html) {
  if (!html) return false;
  return /just a moment|checking your browser|cf-browser-verification|enable javascript and cookies|verifying you are human|attention required|please enable (?:js|javascript|cookies)/i.test(html);
}

/**
 * Laedt eine Seite ueber den Reader-Dienst und trennt dessen Kopfzeilen (Title/Published Time)
 * vom eigentlichen Inhalt ab. Gibt { title, publishedAt, text } zurueck oder null. Wirft nie.
 */
function fetchViaReader(url) {
  try {
    var res = UrlFetchApp.fetch(READER_ENDPOINT + url, {
      muteHttpExceptions: true, followRedirects: true,
      headers: { 'Accept': 'text/plain', 'Accept-Language': 'de,en;q=0.8', 'User-Agent': UA }
    });
    if (res.getResponseCode() !== 200) return null;
    var body = res.getContentText();
    if (!body) return null;
    var out = { title: '', publishedAt: '', text: '' };
    var tm = body.match(/^Title:\s*(.+)$/m); if (tm) out.title = tm[1].trim();
    var pm = body.match(/^Published Time:\s*(.+)$/m); if (pm) out.publishedAt = pm[1].trim();
    var idx = body.indexOf('Markdown Content:');
    out.text = (idx >= 0 ? body.slice(idx + 'Markdown Content:'.length) : body).trim();
    return out;
  } catch (e) { return null; }
}

/** Versucht, aus einem Google-News-Wrapper-Link die Original-Artikel-URL zu dekodieren. */
function resolveGoogleNews(url) {
  try {
    var m = url.match(/\/(?:rss\/)?(?:articles|read)\/([A-Za-z0-9_\-]+)/);
    if (!m) return url;
    var b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bytes = Utilities.base64Decode(b64);
    var str = Utilities.newBlob(bytes).getDataAsString('ISO-8859-1');
    var um = str.match(/https?:\/\/[A-Za-z0-9._~:\/?#\[\]@!$&'()*+,;=%-]+/);
    if (um && um[0].length > 15) return um[0];
  } catch (e) {}
  return url;
}

/** Liest den content-Wert eines <meta>-Tags mit property/name/itemprop = key (Attribut-Reihenfolge egal). */
function metaProp(html, key) {
  var k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var re = new RegExp('<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["\']' + k + '["\'][^>]*>', 'i');
  var tag = html.match(re);
  if (!tag) return '';
  var c = tag[0].match(/content\s*=\s*["\']([^"\']*)["\']/i);
  return c ? c[1].trim() : '';
}

function titleTag(html) {
  var m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : '';
}

function jsonLd(html, key) {
  var m = html.match(new RegExp('"' + key + '"\\s*:\\s*"([^"\\\\]+)"', 'i'));
  return m ? m[1] : '';
}

function jsonLdAuthor(html) {
  var m = html.match(/"author"\s*:\s*\{[^}]*?"name"\s*:\s*"([^"\\]+)"/i);
  if (m) return m[1];
  m = html.match(/"author"\s*:\s*"([^"\\]+)"/i);
  return m ? m[1] : '';
}

function domainOf(u) {
  var m = String(u || '').match(/^https?:\/\/([^\/?#]+)/i);
  return m ? m[1].replace(/^www\./i, '') : '';
}

/** Waehlt den inhaltlich relevanten HTML-Block (article > main > body). */
function pickContent(html) {
  var arts = html.match(/<article[\s\S]*?<\/article>/gi);
  if (arts && arts.length) {
    arts.sort(function (a, b) { return b.length - a.length; });
    if (arts[0].length > 400) return arts[0];
  }
  var main = html.match(/<main[\s\S]*?<\/main>/i);
  if (main && main[0].length > 400) return main[0];
  var body = html.match(/<body[\s\S]*?<\/body>/i);
  return body ? body[0] : html;
}

/** Wandelt einen HTML-Block in lesbaren Fliesstext. */
function htmlToText(block) {
  var s = String(block || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ')
    .replace(/<figure[\s\S]*?<\/figure>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|section|article|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s)
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s;
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(parseInt(d, 10)); })
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&mdash;/gi, '—').replace(/&ndash;/gi, '–').replace(/&hellip;/gi, '…')
    .replace(/&rsquo;/gi, '’').replace(/&lsquo;/gi, '‘')
    .replace(/&ldquo;/gi, '“').replace(/&rdquo;/gi, '”')
    .replace(/&euro;/gi, '€');
}

/** Entfernt Fragmente + gaengige Tracking-Parameter (nur fuer Dedup/ID; Original bleibt lesbar). */
function cleanUrl(u) {
  u = String(u || '').trim().replace(/#.*$/, '');
  u = u.replace(/([?&])(utm_[^=&]+|fbclid|gclid|mc_[^=&]+|igshid)=[^&]*/gi, '$1');
  u = u.replace(/[?&]+$/, '').replace(/\?&/, '?').replace(/&&+/g, '&');
  return u;
}

/** Kurze, stabile ID aus der (bereinigten) URL. */
function newsId(url) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, url, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < raw.length; i++) {
    var b = (raw[i] < 0 ? raw[i] + 256 : raw[i]).toString(16);
    hex += (b.length < 2 ? '0' + b : b);
  }
  return 'n_' + hex.slice(0, 16);
}

// =============================== HELFER ==================================

/** Wandelt ISO-8601-Dauer (z. B. PT1H2M3S) in Sekunden. */
function parseIso8601Duration(str) {
  var m = String(str || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || 0, 10) * 3600) + (parseInt(m[2] || 0, 10) * 60) + parseInt(m[3] || 0, 10);
}

function formatDuration(s) {
  s = parseInt(s, 10) || 0;
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return h > 0 ? (h + ':' + p(m) + ':' + p(x)) : (m + ':' + p(x));
}

function extractVideoId(url) {
  if (!url) return '';
  url = String(url);
  var patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
    /\/live\/([A-Za-z0-9_-]{11})/
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = url.match(patterns[i]);
    if (m) return m[1];
  }
  var bare = url.match(/^\s*([A-Za-z0-9_-]{11})\s*$/);
  return bare ? bare[1] : '';
}

// =========================== TABELLEN-HELFER =============================

function ytRowToObj(a) {
  var t = {};
  try { t = JSON.parse(a[COL.translations - 1] || '{}'); } catch (e) { t = {}; }
  var qa = [];
  try { qa = JSON.parse(a[COL.qa - 1] || '[]'); } catch (e) { qa = []; }
  return {
    kind: 'yt',
    id: a[COL.id - 1],
    url: a[COL.url - 1],
    title: a[COL.title - 1],
    channel: a[COL.channel - 1],
    durationSeconds: a[COL.durationSeconds - 1],
    durationText: dauerAlsText(a[COL.durationText - 1], a[COL.durationSeconds - 1]),
    thumbnail: a[COL.thumbnail - 1],
    status: a[COL.status - 1],
    language: a[COL.language - 1],
    summary: a[COL.summary - 1],
    translations: t,
    error: a[COL.error - 1],
    addedAt: a[COL.addedAt - 1],
    processedAt: a[COL.processedAt - 1],
    publishedAt: a[COL.publishedAt - 1],
    viewCount: a[COL.viewCount - 1],
    likeCount: a[COL.likeCount - 1],
    commentCount: a[COL.commentCount - 1],
    qa: qa,
    tags: parseTags(a[COL.tags - 1]),
    read: !!a[COL.read - 1],
    attempts: t._attempts || 0
  };
}

function newsRowToObj(a) {
  var C = NEWS_COL;
  var t = {};
  try { t = JSON.parse(a[C.translations - 1] || '{}'); } catch (e) { t = {}; }
  var qa = [];
  try { qa = JSON.parse(a[C.qa - 1] || '[]'); } catch (e) { qa = []; }
  return {
    kind: 'news',
    id: a[C.id - 1],
    url: a[C.url - 1],
    title: a[C.title - 1],
    source: a[C.source - 1],
    image: a[C.image - 1],
    status: a[C.status - 1],
    language: a[C.language - 1],
    summary: a[C.summary - 1],
    translations: t,
    error: a[C.error - 1],
    addedAt: a[C.addedAt - 1],
    processedAt: a[C.processedAt - 1],
    publishedAt: a[C.publishedAt - 1],
    author: a[C.author - 1],
    qa: qa,
    tags: parseTags(a[C.tags - 1]),
    read: !!a[C.read - 1],
    attempts: t._attempts || 0
  };
}

function mailRowToObj(a) {
  var C = MAIL_COL;
  var t = {};
  try { t = JSON.parse(a[C.translations - 1] || '{}'); } catch (e) { t = {}; }
  var qa = [];
  try { qa = JSON.parse(a[C.qa - 1] || '[]'); } catch (e) { qa = []; }
  var att = [];
  try { att = JSON.parse(a[C.attachments - 1] || '[]'); } catch (e) { att = []; }
  return {
    kind: 'mail',
    id: a[C.id - 1],
    url: a[C.url - 1],
    title: a[C.title - 1],
    source: a[C.source - 1],
    image: a[C.image - 1],
    status: a[C.status - 1],
    language: a[C.language - 1],
    summary: a[C.summary - 1],
    translations: t,
    error: a[C.error - 1],
    addedAt: a[C.addedAt - 1],
    processedAt: a[C.processedAt - 1],
    publishedAt: a[C.publishedAt - 1],
    author: a[C.author - 1],
    qa: qa,
    attachments: att,
    tags: parseTags(a[C.tags - 1]),
    read: !!a[C.read - 1],
    attempts: t._attempts || 0
  };
}

/** Schlagworte aus der Zelle lesen (JSON-Liste oder kommagetrennt). */
function parseTags(v) {
  if (!v) return [];
  var s = String(v).trim();
  try { var j = JSON.parse(s); if (Object.prototype.toString.call(j) === '[object Array]') return j; } catch (e) {}
  return s.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}

/** Trennt die abschliessende TAGS-Zeile vom Zusammenfassungstext. */
function splitTags(text) {
  var t = String(text || '');
  var m = t.match(/^[ \t]*\**TAGS?\**[ \t]*:[ \t]*(.+?)[ \t]*$/mi);
  if (!m) return { text: t.trim(), tags: [] };
  var tags = m[1].split(',').map(function (x) {
    return x.trim().replace(/^[#*\-\s]+|[.\s]+$/g, '');
  }).filter(Boolean).slice(0, 6);
  return { text: t.replace(m[0], '').replace(/\n{3,}/g, '\n\n').trim(), tags: tags };
}

function rowToObjFor(kind, v) {
  if (kind === 'mail') return mailRowToObj(v);
  return kind === 'news' ? newsRowToObj(v) : ytRowToObj(v);
}

/**
 * Liefert die Eintraege einer Art.
 * light=true laesst die grossen Textfelder (Zusammenfassung, Fragen) weg UND liest sie gar nicht
 * erst aus der Tabelle. Das ist um ein Vielfaches schneller und kleiner – die App holt den
 * Volltext eines Eintrags erst dann einzeln nach, wenn er wirklich gebraucht wird.
 */
function listEntriesFor(kind, light) {
  var kc = cfgFor(kind);
  var sheet = getSheetFor(kind);
  ensureColumnsFor(sheet, kc.COLS);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var ueberspringen = [kc.COL.summary, kc.COL.qa];
  if (kc.COL.input) ueberspringen.push(kc.COL.input);
  var vals = light ? readRowsSkipping(sheet, last - 1, kc, ueberspringen)
                   : sheet.getRange(2, 1, last - 1, kc.COLS).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (!vals[i][kc.COL.id - 1]) continue;
    var o = rowToObjFor(kind, vals[i]);
    if (light) o.light = true; // Kennzeichen: Volltext fehlt noch
    out.push(o);
  }
  out.reverse(); // neueste zuerst
  return out;
}

/**
 * Liest alle Datenzeilen, ueberspringt dabei aber die angegebenen Spalten (sie bleiben leer).
 * Dadurch werden die grossen Textzellen erst gar nicht aus der Tabelle geholt.
 */
function readRowsSkipping(sheet, numRows, kc, skipCols) {
  var skip = {};
  for (var s = 0; s < skipCols.length; s++) skip[skipCols[s]] = true;
  // Leeres Raster in voller Breite vorbereiten
  var rows = [];
  for (var r = 0; r < numRows; r++) {
    var blank = [];
    for (var c = 0; c < kc.COLS; c++) blank.push('');
    rows.push(blank);
  }
  // Zusammenhaengende Abschnitte ohne uebersprungene Spalten am Stueck lesen
  var start = 0;
  for (var col = 1; col <= kc.COLS + 1; col++) {
    if (col <= kc.COLS && !skip[col]) { if (!start) start = col; continue; }
    if (start) {
      var width = col - start;
      var part = sheet.getRange(2, start, numRows, width).getValues();
      for (var i = 0; i < numRows; i++) {
        for (var j = 0; j < width; j++) rows[i][start - 1 + j] = part[i][j];
      }
      start = 0;
    }
  }
  return rows;
}

/** Liefert einen einzelnen Eintrag vollstaendig (inkl. Zusammenfassung und Fragen). */
function doGetOne(kind, id) {
  var kc = cfgFor(kind);
  var sheet = getSheetFor(kind);
  var idx = findRowById(sheet, kc.COL.id, id);
  if (idx < 0) return { ok: false, error: 'Eintrag nicht gefunden.' };
  var v = sheet.getRange(idx, 1, 1, kc.COLS).getValues()[0];
  return { ok: true, entry: rowToObjFor(kind, v) };
}

/**
 * Liefert mehrere Eintraege in EINEM Aufruf. Frueher kostete das Nachladen von vier
 * Zusammenfassungen vier Roundtrips zu je ein bis zwei Sekunden – hier ist es einer.
 * Gelesen wird der Block zwischen der kleinsten und groessten Trefferzeile am Stueck.
 */
function doGetMany(kind, idsRoh) {
  var ids = String(idsRoh || '').split(',').filter(function (x) { return x !== ''; });
  if (!ids.length) return { ok: true, entries: [] };
  if (ids.length > 25) ids = ids.slice(0, 25);   // Deckel: Apps Script mag keine Riesenantworten

  var kc = cfgFor(kind);
  var sheet = getSheetFor(kind);
  var last = sheet.getLastRow();
  if (last < 2) return { ok: true, entries: [] };

  var idSpalte = sheet.getRange(2, kc.COL.id, last - 1, 1).getValues();
  var gesucht = {};
  for (var i = 0; i < ids.length; i++) gesucht[String(ids[i])] = true;

  var zeilen = [];
  for (var r = 0; r < idSpalte.length; r++) {
    if (gesucht[String(idSpalte[r][0])]) zeilen.push(r + 2);
  }
  if (!zeilen.length) return { ok: true, entries: [] };

  var von = zeilen[0], bis = zeilen[zeilen.length - 1];
  var block = sheet.getRange(von, 1, bis - von + 1, kc.COLS).getValues();
  var entries = [];
  for (var z = 0; z < zeilen.length; z++) {
    entries.push(rowToObjFor(kind, block[zeilen[z] - von]));
  }
  return { ok: true, entries: entries };
}

/**
 * Liefert die Laenge immer als "14:06". Aeltere Zeilen enthalten hier ein Datum, weil die
 * Tabelle "14:06" als Uhrzeit interpretiert hat – daraus rechnen wir den Text zurueck.
 */
function dauerAlsText(wert, sekunden) {
  if (wert instanceof Date) {
    var s = wert.getHours() * 3600 + wert.getMinutes() * 60 + wert.getSeconds();
    return formatDuration(parseInt(sekunden, 10) || s);
  }
  return wert;
}

function findFirstByStatus(sheet, statusCol, status) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var col = sheet.getRange(2, statusCol, last - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (col[i][0] === status) return i + 2;
  }
  return -1;
}

function findRowById(sheet, idCol, id) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var col = sheet.getRange(2, idCol, last - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

// ============================== TEST-HILFE ===============================

/** Optional manuell ausfuehrbar: fuegt ein kurzes Test-Video hinzu und verarbeitet es sofort. */
function selfTest() {
  doAddYt('https://www.youtube.com/watch?v=aqz-KE-bpKQ'); // Big Buck Bunny (oeffentlich)
  processPending();
  Logger.log(JSON.stringify(listEntriesFor('yt'), null, 2));
}

/** Optional: fuegt einen Test-Artikel hinzu und verarbeitet ihn sofort. */
function selfTestNews() {
  doAddNews('https://en.wikipedia.org/wiki/News');
  processPending();
  Logger.log(JSON.stringify(listEntriesFor('news'), null, 2));
}
