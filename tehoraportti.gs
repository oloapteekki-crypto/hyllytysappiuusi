// === Hyllytysappi — Päivittäinen tehoraportti ===
// Google Apps Script — lähettää sähköpostiraportin klo 18
//
// ASENNUS:
// 1. Mene https://script.google.com
// 2. Luo uusi projekti (+ New project)
// 3. Liitä tämä koodi
// 4. Tallenna (Ctrl+S)
// 5. Aja "createDailyTrigger" kerran (valitse funktio ylävalikosta → Run)
// 6. Hyväksy käyttöoikeudet
// Valmis — raportti lähtee joka päivä klo 18

// Firebase-asetukset
const FIREBASE_URL = 'https://hyllytysappi-default-rtdb.europe-west1.firebasedatabase.app';

/**
 * Hakee päivän suoritusdata Firebasesta
 */
function getPerformanceData(dateStr) {
  const url = FIREBASE_URL + '/sessions/' + dateStr + '/performance.json';
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  
  if (response.getResponseCode() !== 200) return null;
  
  const data = JSON.parse(response.getContentText());
  return data;
}

/**
 * Muotoilee millisekunnit "X min Y s" -muotoon
 */
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min + ' min ' + sec + ' s';
}

/**
 * Luo ja lähettää päiväraportin
 */
function sendDailyReport() {
  // Tämän päivän data
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10);
  
  const data = getPerformanceData(dateStr);
  
  if (!data || Object.keys(data).length === 0) {
    // Ei dataa — ei lähetetä raporttia
    Logger.log('Ei suoritusdataa päivälle ' + dateStr);
    return;
  }
  
  // Kerää suoritukset
  const entries = [];
  for (const key in data) {
    const d = data[key];
    entries.push({
      worker: d.worker || '?',
      cartName: d.cartName || d.cart || '?',
      elapsed: d.elapsed || 0,
      shelved: d.shelved || 0,
      expected: d.expected || 0,
      items: d.items || 0,
      start: d.start ? new Date(d.start) : null,
      end: d.end ? new Date(d.end) : null
    });
  }
  
  // Lajittele aloitusajan mukaan
  entries.sort(function(a, b) { return (a.start || 0) - (b.start || 0); });
  
  // Laske yhteenveto per työntekijä
  const byWorker = {};
  entries.forEach(function(e) {
    if (!byWorker[e.worker]) byWorker[e.worker] = { total: 0, shelved: 0, carts: 0 };
    byWorker[e.worker].total += e.elapsed;
    byWorker[e.worker].shelved += e.shelved;
    byWorker[e.worker].carts += 1;
  });
  
  // Rakenna HTML-sähköposti
  var html = '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto">';
  html += '<h2 style="color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:8px">📊 Hyllytysraportti — ' + dateStr + '</h2>';
  
  // Yhteenveto
  html += '<h3 style="color:#475569;margin-top:16px">Yhteenveto per työntekijä</h3>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">';
  html += '<tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0"><th style="padding:8px;text-align:left">Nimi</th><th style="padding:8px;text-align:right">Kärryjä</th><th style="padding:8px;text-align:right">Tuotteita</th><th style="padding:8px;text-align:right">Aika yht.</th><th style="padding:8px;text-align:right">Tuot./min</th></tr>';
  
  const workerNames = Object.keys(byWorker).sort();
  workerNames.forEach(function(name) {
    const w = byWorker[name];
    const totalMin = w.total / 60000;
    const perMin = totalMin > 0 ? (w.shelved / totalMin).toFixed(1) : '—';
    html += '<tr style="border-bottom:1px solid #f1f5f9">';
    html += '<td style="padding:8px;font-weight:600">' + name + '</td>';
    html += '<td style="padding:8px;text-align:right">' + w.carts + '</td>';
    html += '<td style="padding:8px;text-align:right">' + w.shelved + '</td>';
    html += '<td style="padding:8px;text-align:right">' + formatTime(w.total) + '</td>';
    html += '<td style="padding:8px;text-align:right;font-weight:700;color:#16a34a">' + perMin + '</td>';
    html += '</tr>';
  });
  html += '</table>';
  
  // Yksittäiset suoritukset
  html += '<h3 style="color:#475569;margin-top:16px">Yksittäiset hyllytykset</h3>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
  html += '<tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0"><th style="padding:6px;text-align:left">Klo</th><th style="padding:6px;text-align:left">Nimi</th><th style="padding:6px;text-align:left">Kärry</th><th style="padding:6px;text-align:right">Tuot.</th><th style="padding:6px;text-align:right">Aika</th><th style="padding:6px;text-align:right">T/min</th></tr>';
  
  entries.forEach(function(e) {
    const startStr = e.start ? (e.start.getHours() + ':' + ('0' + e.start.getMinutes()).slice(-2)) : '?';
    const totalMin = e.elapsed / 60000;
    const perMin = totalMin > 0 ? (e.shelved / totalMin).toFixed(1) : '—';
    const color = e.shelved < e.expected ? '#dc2626' : '#16a34a';
    html += '<tr style="border-bottom:1px solid #f1f5f9">';
    html += '<td style="padding:6px">' + startStr + '</td>';
    html += '<td style="padding:6px">' + e.worker + '</td>';
    html += '<td style="padding:6px">' + e.cartName + '</td>';
    html += '<td style="padding:6px;text-align:right;color:' + color + '">' + e.shelved + '/' + e.expected + '</td>';
    html += '<td style="padding:6px;text-align:right">' + formatTime(e.elapsed) + '</td>';
    html += '<td style="padding:6px;text-align:right;font-weight:700">' + perMin + '</td>';
    html += '</tr>';
  });
  html += '</table>';
  
  html += '<p style="margin-top:16px;font-size:12px;color:#94a3b8">Automaattinen raportti — Hyllytysappi</p>';
  html += '</div>';
  
  // Lähetä
  const email = Session.getActiveUser().getEmail();
  GmailApp.sendEmail(email, '📊 Hyllytysraportti — ' + dateStr, '', { htmlBody: html });
  
  Logger.log('Raportti lähetetty: ' + email);
}

/**
 * Luo päivittäisen ajastimen — aja KERRAN
 */
function createDailyTrigger() {
  // Poista vanhat triggerit
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) { ScriptApp.deleteTrigger(t); });
  
  // Luo uusi: joka päivä klo 18-19
  ScriptApp.newTrigger('sendDailyReport')
    .timeBased()
    .everyDays(1)
    .atHour(18)
    .create();
  
  Logger.log('Ajastin luotu: joka päivä klo 18');
}

/**
 * Testifunktio — lähettää raportin heti
 */
function testReport() {
  sendDailyReport();
}
