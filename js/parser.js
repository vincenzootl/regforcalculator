'use strict';

/* ── PDF.js worker ─────────────────────────────────────────── */
// PDF.js 2.16 — il worker viene caricato dal tag <script> sopra
// In PDF.js 2.x, caricare il worker.min.js come script globale
// è sufficiente: il worker viene trovato automaticamente.
// Nessuna configurazione aggiuntiva necessaria.
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

/* ── STATE ─────────────────────────────────────────────────── */
const extracted = {};   // dati estratti dai documenti
const files = {};       // file caricati per tipo
let S = {};             // stato calcolo
let chartCfr = null, chartAcc = null;
let prevYear = {};      // dati anno precedente estratti

/* ── TOOLTIP CONTENT ───────────────────────────────────────── */
const TIPS = {
  fatt:{ icon:'🧾', title:'Fatturato da FattureInCloud',
    body:'Totale delle fatture emesse nell\'anno, come appare nel riepilogo di FattureInCloud. Non include le marche da bollo, che aggiungiamo separatamente (€ 2 per ogni fattura esente IVA > € 77,47).',
    example:'Es.: € 25.000 da FattureInCloud + € 60 di bolli (30 fatture) = € 25.060 da dichiarare' },
  bolli:{ icon:'📮', title:'Fatture con marca da bollo',
    body:'Ogni fattura emessa in esenzione IVA con importo > € 77,47 richiede una marca da bollo virtuale di € 2,00. FattureInCloud non la inserisce nelle righe, va aggiunta manualmente in dichiarazione.',
    example:'30 fatture × € 2 = € 60 da aggiungere al fatturato dichiarato' },
  coeff:{ icon:'📐', title:'Coefficiente di redditività',
    body:'Nel regime forfettario non si deducono le spese reali. Il tuo codice ATECO determina una percentuale fissa del fatturato considerata "reddito". Il resto è costo forfettizzato.',
    example:'Comunicazione/marketing (ATECO 731xxx, 741xxx): 78%. Su € 25.000 → reddito lordo € 19.500' },
  aliq:{ icon:'📊', title:'Imposta sostitutiva',
    body:'Sostituisce IRPEF e addizionali. È al 5% per i primi 5 anni di attività, poi diventa 15%. Si applica sul reddito netto (dopo deduzione contributi INPS).',
    example:'Dopo 5 anni: 15% × € 15.000 di reddito netto = € 2.250 di imposta' },
  inpsDed:{ icon:'🔄', title:'Contributi INPS deducibili',
    body:'Nel forfettario si deduce dal reddito lordo l\'importo dei contributi INPS effettivamente versati nell\'anno solare. Include il saldo dell\'anno precedente e i due acconti dell\'anno corrente.',
    example:'Saldo anno prec. (€ 500) + 1° acconto (€ 1.200) + 2° acconto (€ 1.200) = € 2.900 deducibili' },
  inpsAliq:{ icon:'🏛️', title:'Aliquota INPS Gestione Separata',
    body:'I liberi professionisti senza altra cassa previdenziale sono iscritti alla Gestione Separata INPS. L\'aliquota 2025 è 26,07% sul reddito lordo forfettario.',
    example:'26,07% × € 19.500 di reddito lordo = circa € 5.084 di contributi dovuti' },
  accImp:{ icon:'💳', title:'Acconti imposta sostitutiva già versati',
    body:'Durante l\'anno hai versato acconti sull\'imposta sostitutiva (codice 1790 + 1791 nei tuoi F24). Li trovi anche nel rigo LM45 della dichiarazione precompilata.',
    example:'1° acconto € 400 + 2° acconto € 400 = € 800 versati durante l\'anno' },
  accInps:{ icon:'💳', title:'Acconti INPS già versati',
    body:'Totale dei versamenti INPS Gestione Separata (codice 0900 PXX) effettuati durante l\'anno. Include saldo anno precedente + due acconti anno corrente.',
    example:'Saldo anno prec. (€ 500) + 1° acc. (€ 1.200) + 2° acc. (€ 1.200) = € 2.900' },
  credito:{ icon:'✅', title:'Credito anno precedente residuo',
    body:'Se dalla dichiarazione dell\'anno scorso è emerso un credito fiscale non ancora compensato. Lo trovi nel rigo LM43 della precompilata meno quanto già compensato (LM44).',
    example:'LM43 = € 66, LM44 = € 66 → credito residuo = € 0' },
  mesi:{ icon:'📅', title:'Mesi al F24 di giugno',
    body:'Quanti mesi mancano alla scadenza del F24 di giugno. Il calcolatore divide il totale da versare per questo numero per darti la rata mensile da accantonare.',
    example:'6 mesi rimanenti e € 6.000 da versare → € 1.000 al mese da mettere da parte' }
};

function openTip(k) {
  const t = TIPS[k]; if (!t) return;
  document.getElementById('tip-icon').textContent = t.icon;
  document.getElementById('tip-title').textContent = t.title;
  document.getElementById('tip-body').textContent = t.body;
  const ex = document.getElementById('tip-example');
  if (t.example) { ex.textContent = t.example; ex.style.display = 'block'; }
  else ex.style.display = 'none';
  document.getElementById('tip-overlay').classList.add('open');
}
function closeTip(e) {
  if (e && e.target !== document.getElementById('tip-overlay')) return;
  document.getElementById('tip-overlay').classList.remove('open');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTip(null); });

/* ── STEPPER ───────────────────────────────────────────────── */
let currentStep = 0;
function goStep(n) {
  document.querySelectorAll('.section').forEach((s,i) => s.classList.toggle('active', i === n));
  document.querySelectorAll('.step-btn').forEach((b,i) => {
    b.classList.toggle('active', i === n);
    b.classList.toggle('done', i < n);
  });
  currentStep = n;
  window.scrollTo({top:0, behavior:'smooth'});
}
function skipDocs() { goStep(1); }

/* ── FILE UPLOAD HELPERS ───────────────────────────────────── */
function dragOver(e, el) { e.preventDefault(); el.classList.add('drag'); }
function dragLeave(el) { el.classList.remove('drag'); }
function dropFile(e, type) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag');
  const f = e.dataTransfer.files;
  if (f.length) processFiles(Array.from(f), type);
}
function handleFile(e, type) {
  const f = e.target.files;
  if (f.length) processFiles(Array.from(f), type);
}

function setBadge(type, names) {
  const el = document.getElementById(type + '-badge');
  const uz = document.getElementById('uz-' + type);
  if (names.length) {
    uz.classList.add('has-file');
    el.innerHTML = names.map(n =>
      `<span class="file-badge">✓ ${n.length > 22 ? n.slice(0,20)+'…' : n}</span>`
    ).join('');
  }
}

/* ── LOG ────────────────────────────────────────────────────── */
function log(msg, cls='') {
  const el = document.getElementById('extract-log');
  el.classList.add('visible');
  el.innerHTML += `<div class="${cls}">› ${msg}</div>`;
  el.scrollTop = el.scrollHeight;
}
function logOk(m) { log(m, 'log-ok'); }
function logWarn(m) { log(m, 'log-warn'); }
function logInfo(m) { log(m, 'log-info'); }
function logErr(m) { log(m, 'log-err'); }

/* ── PDF TEXT EXTRACTION ───────────────────────────────────── */
async function pdfToText(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data: buf}).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
  }
  return text;
}

/* ── UTILS ──────────────────────────────────────────────────── */

// Converte stringa IT in numero: "1.892,06" → 1892.06
function parseIT(s) {
  if (!s) return null;
  const clean = String(s).trim().replace(/\./g,'').replace(',','.');
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

// Estrae TUTTI i numeri con formato italiano da una stringa
function extractAmounts(s) {
  const matches = s.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
  return matches.map(parseIT).filter(v => v !== null && v > 0);
}

// Estrae importi dal formato F24 grafico: "1.892 06" (spazio al posto della virgola)
function extractAmountsGraf(s) {
  const results = [...extractAmounts(s)];
  const re = /(?<!\d)((?:\d{1,3}\.)*\d{1,3})\s+(\d{2})(?!\d)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const v = parseIT(m[1] + ',' + m[2]);
    if (v && v > 0) results.push(v);
  }
  return results;
}

// Cerca il primo numero dopo un'etichetta nel testo (finestra scorrevole)
function findLabel(text, label, windowChars) {
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  const chunk = text.slice(idx, idx + (windowChars || 300));
  const amounts = extractAmounts(chunk);
  return amounts.length ? amounts[0] : null;
}

// Cerca il numero più vicino DOPO una label regex nel testo
function findRegex(text, pattern) {
  const re = new RegExp(pattern, 'i');
  const m = text.match(re);
  if (!m) return null;
  // cerca il primo numero nella stringa dopo il match
  const after = text.slice(text.indexOf(m[0]) + m[0].length, text.indexOf(m[0]) + m[0].length + 200);
  const amounts = extractAmounts(after);
  return amounts.length ? amounts[0] : null;
}

/* ── PARSER F24 ──────────────────────────────────────────────── */
/*
  I PDF F24 si presentano in TRE formati distinti:

  FORMATO A — Ricevuta di riepilogo (la più comune):
    "Importo versamento : E. 2.819,06"
    → estraiamo il totale versato

  FORMATO B — Modello F24 grafico (PDF con celle del modulo):
    Numeri nel formato "1.892 06" (spazio invece della virgola decimale)
    perché ogni cella del modello è un token PDF separato.
    → Il saldo finale è il numero più grande e compare per ultimo.
    → Separare INPS da imposta sostitutiva è inaffidabile su questo formato
      perché i totali di riga si confondono con i singoli importi.
    → Strategia: estraiamo il SALDO FINALE totale del F24.
      La separazione INPS/imposta la facciamo con la dichiarazione RPF (LM35/LM45).

  FORMATO C — Modello F24 digitale (testo selezionabile):
    Numeri nel formato standard "1.892,06"
    → Possiamo estrarre per codice tributo (0900, 1790, 1791, 1792)

  In tutti i casi, sommiamo i saldi finali di tutti i F24 caricati.
*/
function parseF24(text) {
  logInfo('F24: analisi formato PDF...');

  const result = {
    acc0900: 0,
    acc1790: 0,
    acc1791: 0,
    acc1792: 0,
    totaleVersato: 0,
    isRicevuta: false,
    isGrafico: false
  };

  const flat = text.replace(/\s+/g, ' ').trim();

  // ── FORMATO A: Ricevuta ──────────────────────────────────────────
  const ricevutaRe = /[Ii]mporto\s+versamento\s*:\s*[Ee]\.?\s*([\d\.]+,\d{2})/g;
  let mRic, totRic = 0, nRic = 0;
  while ((mRic = ricevutaRe.exec(flat)) !== null) {
    const v = parseIT(mRic[1]);
    if (v && v > 0 && v < 100000) { totRic += v; nRic++; logOk(`Ricevuta: € ${fmtEur(v)}`); }
  }
  if (nRic > 0) {
    result.isRicevuta = true;
    result.totaleVersato = Math.round(totRic * 100) / 100;
    logInfo(`${nRic} ricevuta/e — totale: € ${fmtEur(result.totaleVersato)}`);
    logInfo('Le ricevute non distinguono INPS da imposta: usa anche la dichiarazione RPF.');
    return result;
  }

  // ── FORMATO C: F24 digitale con codici tributo standard ──────────
  const TRIBUTI = [
    { key: 'acc0900', code: '0900', label: 'INPS GS' },
    { key: 'acc1790', code: '1790', label: 'Imp.sost. 1°acc' },
    { key: 'acc1791', code: '1791', label: 'Imp.sost. 2°acc' },
    { key: 'acc1792', code: '1792', label: 'Credito' },
  ];
  let trovatiCodici = false;
  for (const t of TRIBUTI) {
    let pos = 0;
    while (true) {
      const idx = flat.indexOf(t.code, pos);
      if (idx === -1) break;
      const window = flat.slice(idx + t.code.length, idx + t.code.length + 80);
      // Cerca importi in formato STANDARD (con virgola): "1.234,56"
      const stdAmounts = extractAmounts(window).filter(v => v >= 10 && v < 30000);
      if (stdAmounts.length) {
        result[t.key] += stdAmounts[0];
        logOk(`Cod.${t.code} (${t.label}): € ${fmtEur(stdAmounts[0])}`);
        trovatiCodici = true;
      }
      pos = idx + t.code.length;
    }
  }
  if (trovatiCodici) {
    result.totaleVersato = result.acc0900 + result.acc1790 + result.acc1791;
    return result;
  }

  // ── FORMATO B: F24 grafico (numeri con spazio: "1.892 06") ───────
  // Estrae importi con il formato "NNN 00" o "N.NNN 00"
  logInfo('F24 grafico rilevato — estraggo saldo finale...');
  result.isGrafico = true;

  // Pattern: numero (con eventuale punto migliaia) + spazio + 2 cifre decimali
  const grafAmounts = [];
  const grafRe = /(?<!\d)((?:\d{1,3}\.)*\d{1,3})\s+(\d{2})(?!\d)/g;
  let mGraf;
  while ((mGraf = grafRe.exec(flat)) !== null) {
    const v = parseIT(mGraf[1] + ',' + mGraf[2]);
    if (v && v > 0) grafAmounts.push(v);
  }

  // Il saldo finale è il valore più grande tra tutti
  const saldi = grafAmounts.filter(v => v >= 100 && v < 100000);
  if (saldi.length) {
    // Sommiamo i valori distinti > 1000 (i saldi finali dei F24)
    const saldiSignificativi = [...new Set(saldi.filter(v => v > 1000))].sort((a,b) => b-a);
    // In un PDF multipagina, lo stesso saldo compare 3 volte (3 copie del modello)
    // Prendiamo i valori UNICI
    result.totaleVersato = saldiSignificativi.length > 0 ? saldiSignificativi[0] : 0;
    logOk(`F24 grafico: saldo finale = € ${fmtEur(result.totaleVersato)}`);
    logInfo('F24 grafico: carica anche la dichiarazione RPF per separare INPS e imposta.');
  } else {
    logWarn('F24: nessun importo estratto — PDF potrebbe essere scansionato');
  }

  return result;
}


/* ── PARSER RPF / MODELLO REDDITI ────────────────────────────── */
/*
  I PDF del Modello Redditi PF hanno i righi (LM22, LM34, ecc.) come
  label testuali. PDF.js li estrae linearmente ma l'ordine può variare.
  Strategia: cerca la label esatta, poi il primo numero utile dopo.
  Bug del parser precedente: regex "[^\d]*" falliva quando tra label
  e valore c'erano testi come ",00" o altri token intermedi.
*/
function parseRPF(text) {
  logInfo('RPF/Redditi: scansione quadro LM e RR...');
  const result = {};

  // Normalizza
  const flat = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');

  // Helper: cerca "LMxx" e prende il primo importo significativo dopo
  function getLM(rigo, minVal, maxVal) {
    // Prova label esatta prima
    const labels = [`LM${rigo}`, `LM ${rigo}`, `LM0${rigo}`];
    for (const lbl of labels) {
      const idx = flat.indexOf(lbl);
      if (idx === -1) continue;
      const chunk = flat.slice(idx + lbl.length, idx + lbl.length + 400);
      const amounts = extractAmounts(chunk)
        .filter(v => v >= (minVal || 1) && v <= (maxVal || 999999));
      if (amounts.length) return amounts[0];
    }
    return null;
  }

  function getRR(rigo) {
    const lbl = `RR${rigo}`;
    const idx = flat.indexOf(lbl);
    if (idx === -1) return null;
    const chunk = flat.slice(idx + lbl.length, idx + 400);
    const amounts = extractAmounts(chunk).filter(v => v >= 1 && v <= 99999);
    return amounts.length ? amounts[0] : null;
  }

  // LM22 — Componenti positivi (fatturato, prima riga della sezione III)
  // Nel PDF il valore appare come "5.815,00" o "30.396,00"
  const lm22 = getLM(22, 100, 500000);
  if (lm22 != null) {
    result.fatt = lm22;
    logOk(`LM22 componenti positivi (fatturato) = € ${lm22.toLocaleString('it-IT',{minimumFractionDigits:2})}`);
  }

  // LM34 — Reddito lordo
  const lm34 = getLM(34, 100, 500000);
  if (lm34 != null) {
    result.redLordo = lm34;
    logOk(`LM34 reddito lordo = € ${lm34.toLocaleString('it-IT',{minimumFractionDigits:2})}`);
  }

  // LM35 — Contributi previdenziali deducibili
  const lm35 = getLM(35, 1, 50000);
  if (lm35 != null) {
    result.inpsDed = lm35;
    logOk(`LM35 contributi INPS deducibili = € ${lm35.toLocaleString('it-IT',{minimumFractionDigits:2})}`);
  }

  // LM36 — Reddito netto
  const lm36 = getLM(36, 1, 500000);
  if (lm36 != null) {
    result.redNetto = lm36;
    logOk(`LM36 reddito netto = € ${lm36.toLocaleString('it-IT',{minimumFractionDigits:2})}`);
  }

  // LM39 — Imposta sostitutiva dovuta
  const lm39 = getLM(39, 1, 50000);
  if (lm39 != null) {
    result.imposta = lm39;
    logOk(`LM39 imposta sostitutiva = € ${lm39.toLocaleString('it-IT',{minimumFractionDigits:2})}`);
  }

  // LM43 — Eccedenza anno precedente
  const lm43 = getLM(43, 0.01, 10000);
  if (lm43 != null) {
    result.lm43 = lm43;
    logOk(`LM43 eccedenza anno prec. = € ${lm43.toLocaleString('it-IT',{minimumFractionDigits:2})}`);
  }

  // LM44 — Eccedenza compensata nel mod. F24
  const lm44 = getLM(44, 0.01, 10000);
  if (lm44 != null) {
    result.lm44 = lm44;
    logOk(`LM44 eccedenza compensata F24 = € ${lm44.toLocaleString('it-IT',{minimumFractionDigits:2})}`);
  }

  // LM45 — Acconti versati
  const lm45 = getLM(45, 1, 50000);
  if (lm45 != null) {
    result.accImp = lm45;
    logOk(`LM45 acconti imp.sostitutiva = € ${lm45.toLocaleString('it-IT',{minimumFractionDigits:2})}`);
  }

  // Calcola credito residuo
  if (result.lm43 != null && result.lm44 != null) {
    result.credito = Math.max(0, result.lm43 - result.lm44);
    logOk(`Credito residuo (LM43 - LM44) = € ${result.credito.toLocaleString('it-IT',{minimumFractionDigits:2})}`);
  } else if (result.lm43 != null && result.lm44 == null) {
    result.credito = result.lm43;
  }

  // RR5 — Imponibile INPS GS
  const rr5 = getRR(5);
  if (rr5 != null) {
    result.inpsImponibile = rr5;
    logOk(`RR5 imponibile INPS = € ${rr5.toLocaleString('it-IT',{minimumFractionDigits:2})}`);
  }

  // RR6 — Totale contributi dovuti
  const rr6 = getRR(6);
  if (rr6 != null) {
    result.inpsDov = rr6;
    logOk(`RR6 totale contributi INPS dovuti = € ${rr6.toLocaleString('it-IT',{minimumFractionDigits:2})}`);
  }

  // RR7 — Contributo a debito
  const rr7 = getRR(7);
  if (rr7 != null) {
    result.inpsDebito = rr7;
    logOk(`RR7 contributo a debito = € ${rr7.toLocaleString('it-IT',{minimumFractionDigits:2})}`);
  }

  const found = Object.keys(result).length;
  if (found === 0) logWarn('RPF: nessun rigo trovato — il PDF potrebbe essere scansionato o protetto');
  else logOk(`RPF: estratti ${found} valori dal quadro LM/RR`);

  return result;
}

function parseRedditi(text) {
  logInfo('Modello Redditi PF: analisi quadri LM e RR...');
  return parseRPF(text);
}

/* ── PARSER FattureInCloud XML (SpreadsheetML) ───────────────── */
/*
  FattureInCloud esporta un file XML con namespace SpreadsheetML
  (Microsoft Office Spreadsheet). La struttura reale è:
  - Righe di fatture con colonna "Imponibile" (numero puro es. "3440")
  - Righe "Totale" mensili con somma
  - Riga "Totale Annuo" con il fatturato complessivo dell'anno
  Strategia: cerca la riga "Totale Annuo" e prende il primo numero,
  poi conta le righe numeriche per stimare le fatture.
*/
function parseFIC(text) {
  logInfo('FattureInCloud XML (SpreadsheetML): estrazione fatturato...');
  const result = { fatt: 0, nFatture: 0 };

  // ── Metodo 1: cerca "Totale Annuo" nel testo (riga riepilogativa) ──
  // Il valore appare come: <Cell><Data ss:Type="String">Totale Annuo</Data></Cell>
  // seguito da <Cell><Data ss:Type="Number">30396</Data></Cell>
  const totAnnuoIdx = text.indexOf('Totale Annuo');
  if (totAnnuoIdx !== -1) {
    // Prendo i 600 chars successivi e cerco il primo numero > 1000
    const chunk = text.slice(totAnnuoIdx, totAnnuoIdx + 600);
    // Cerca numeri puri (senza virgola, formato SpreadsheetML)
    const numMatches = chunk.match(/>([\d]+(?:\.[\d]+)?)</g) || [];
    for (const m of numMatches) {
      const v = parseFloat(m.replace(/[><]/g, ''));
      if (v >= 1000 && v < 500000) {
        result.fatt = Math.round(v * 100) / 100;
        logOk(`Totale Annuo trovato = € ${result.fatt.toLocaleString('it-IT', {minimumFractionDigits:2})}`);
        break;
      }
    }
  }

  // ── Metodo 2 (fallback): somma righe "Totale" mensili ──────────────
  if (result.fatt === 0) {
    logInfo('FIC: ricerca per totali mensili...');
    const mesi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    let sommaMensile = 0;
    let mesiTrovati = 0;
    for (const mese of mesi) {
      const idx = text.indexOf(mese);
      if (idx === -1) continue;
      const chunk = text.slice(idx, idx + 400);
      const nums = chunk.match(/>([\d]+(?:\.[\d]+)?)</g) || [];
      for (const m of nums) {
        const v = parseFloat(m.replace(/[><]/g, ''));
        if (v >= 100 && v < 50000) {
          sommaMensile += v;
          mesiTrovati++;
          break;
        }
      }
    }
    if (sommaMensile > 0) {
      result.fatt = Math.round(sommaMensile * 100) / 100;
      logOk(`Fatturato da ${mesiTrovati} mesi = € ${result.fatt.toLocaleString('it-IT',{minimumFractionDigits:2})}`);
    }
  }

  // ── Conta fatture emesse: date ISO nei blocchi "Fatture emesse" ──────
  // Il file ha struttura mensile: ogni mese ha sezione "Fatture emesse"
  // seguita da "Fatture ricevute". Contiamo le date (T00:00:00) solo
  // nelle sezioni emesse, escludendo quelle ricevute.
  const sezioniEmesse = [...text.matchAll(/Fatture emesse([\s\S]*?)(?:Fatture ricevute|Tot\.\s*[1-4])/g)];
  let nFattureEmesse = 0;
  sezioniEmesse.forEach(m => {
    nFattureEmesse += (m[1].match(/T00:00:00/g) || []).length;
  });
  // Fallback: se la struttura è diversa, usa il totale delle date nel file
  if (nFattureEmesse === 0) {
    nFattureEmesse = (text.match(/T00:00:00/g) || []).length;
  }
  result.nFatture = nFattureEmesse;
  if (result.nFatture > 0) logOk(`Fatture emesse contate: ${result.nFatture}`);

  if (result.fatt === 0) {
    logWarn('FIC: fatturato non trovato — verifica che sia il file XML esportato da FattureInCloud');
  }
  if (result.nFatture === 0) {
    logWarn('FIC: conteggio fatture non disponibile — inserisci manualmente il numero di bolli');
  }

  return result;
}

/* ── PROCESS FILES ──────────────────────────────────────────── */
async function processFiles(fileList, type) {
  setBadge(type, fileList.map(f => f.name));
  files[type] = fileList;

  for (const file of fileList) {
    logInfo(`Lettura file: ${file.name}...`);
    try {
      let parsed = {};
      const isPDF = file.name.toLowerCase().endsWith('.pdf');
      const isXML = /\.(xml|xls|xlsx|csv)$/i.test(file.name);

      if (isPDF) {
        const text = await pdfToText(file);
        logInfo(`Testo estratto: ${text.length} caratteri`);
        if (type === 'f24')     parsed = parseF24(text);
        else if (type === 'rpf')    parsed = parseRPF(text);
        else if (type === 'redditi') parsed = parseRedditi(text);
      } else if (isXML) {
        const text = await file.text();
        if (type === 'fic') parsed = parseFIC(text);
      } else {
        logWarn(`Formato non supportato: ${file.name}`);
      }

      Object.assign(extracted, parsed);
    } catch(e) {
      logErr(`Errore lettura ${file.name}: ${e.message}`);
      console.error(e);
    }
  }

  updateExtractedPills();
  prefillFields();
}

/* ── AGGIORNA PILLS ──────────────────────────────────────────── */
const PILL_DEFS = [
  { key:'fatt',     label:'Fatturato',             src:'RPF/FIC' },
  { key:'inpsDed',  label:'INPS deducibili',        src:'RPF/F24' },
  { key:'accImp',   label:'Acconti imp. sost.',     src:'RPF' },
  { key:'credito',  label:'Credito residuo',         src:'RPF' },
  { key:'acc0900',  label:'Versato INPS (0900)',     src:'F24' },
  { key:'acc1790',  label:'Versato imp. (1790)',     src:'F24' },
  { key:'imposta',  label:'Imposta sost. (LM39)',   src:'RPF' },
  { key:'redLordo', label:'Reddito lordo (LM34)',   src:'RPF' },
  { key:'inpsDov',  label:'INPS dovuto (RR6)',       src:'RPF' },
];

function fmtEur(v) { return '\u20AC\u00A0' + Math.abs(v).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtInt(v) { return '\u20AC\u00A0' + Math.round(Math.abs(v)).toLocaleString('it-IT'); }

function updateExtractedPills() {
  const container = document.getElementById('extracted-pills');
  const pills = PILL_DEFS.filter(d => extracted[d.key] != null && extracted[d.key] !== 0);
  if (!pills.length) { container.style.display = 'none'; return; }
  container.style.display = 'grid';
  container.innerHTML = pills.map(d => `
    <div class="ex-pill">
      <div class="ex-pill-src">${d.src}</div>
      <div class="ex-pill-lbl">${d.label}</div>
      <div class="ex-pill-val">${fmtEur(extracted[d.key])}</div>
    </div>`).join('');
}

/* ── PREFILL CAMPI ───────────────────────────────────────────── */
function setSrc(fieldId, isAuto) {
  const el = document.getElementById('src-' + fieldId);
  if (!el) return;
  if (isAuto) { el.textContent = 'da documento'; el.classList.remove('manual'); }
  else        { el.textContent = 'manuale';       el.classList.add('manual'); }
}

function setField(inputId, srcId, value) {
  if (value == null || value === 0) return;
  const el = document.getElementById(inputId);
  if (!el) return;
  el.value = Math.round(value * 100) / 100;
  el.classList.add('auto-filled');
  setSrc(srcId, true);
}

function prefillFields() {
  // 1. Fatturato — FIC ha precedenza su RPF (più preciso)
  const fatt = extracted.fatt;
  if (fatt) setField('i-fatt', 'fatt', fatt);

  // 2. N. bolli — solo da FIC
  if (extracted.nFatture) setField('i-bolli', 'bolli', extracted.nFatture);

  // 3-5. INPS deducibili, acconti imposta, acconti INPS
  //
  // CASO A — Ricevute riepilogative (isRicevuta = true):
  //   Abbiamo solo il totale versato, non i singoli codici.
  //   Il totale F24 = saldo anno prec. + acconti corrente (INPS + imposta misti).
  //   Non possiamo separare automaticamente: usiamo LM35 e LM45 dalla dichiarazione.
  //
  // CASO B — Modello F24 con codici tributo:
  //   Abbiamo acc0900 (INPS) e acc1790+1791 (imposta) separati.
  //   Massima precisione.

  const hasCodici = (extracted.acc0900 || 0) + (extracted.acc1790 || 0) + (extracted.acc1791 || 0) > 0;
  const hasRicevuta = extracted.isRicevuta && extracted.totaleVersato > 0;

  if (hasCodici) {
    // CASO B: codici tributo distinti
    const inpsDed = extracted.acc0900 > 0 ? extracted.acc0900 : (extracted.inpsDed || null);
    if (inpsDed) setField('i-inps-ded', 'inpsDed', inpsDed);

    const accImpF24 = (extracted.acc1790 || 0) + (extracted.acc1791 || 0);
    const accImp = extracted.accImp || (accImpF24 > 0 ? accImpF24 : null);
    if (accImp) setField('i-acc-imp', 'accImp', accImp);

    if (extracted.acc0900 > 0) setField('i-acc-inps', 'accInps', extracted.acc0900);

  } else if (hasRicevuta || extracted.isGrafico) {
    // CASO A/B: ricevute o F24 grafico
    // Non possiamo separare INPS da imposta → usiamo la dichiarazione RPF
    logInfo('F24 caricato. Per i dettagli INPS/imposta, carica anche la dichiarazione RPF.');
    if (extracted.inpsDed) setField('i-inps-ded', 'inpsDed', extracted.inpsDed);
    if (extracted.accImp)  setField('i-acc-imp',  'accImp',  extracted.accImp);
    // Stima acconti INPS: totale F24 meno acconti imposta nota
    const totF24 = extracted.totaleVersato || 0;
    const accImpNota = extracted.accImp || 0;
    const accInpsStima = Math.max(0, totF24 - accImpNota);
    if (accInpsStima > 0) {
      setField('i-acc-inps', 'accInps', accInpsStima);
      logWarn(`Acconti INPS stimati da F24 totale: € ${accInpsStima.toLocaleString('it-IT',{minimumFractionDigits:2})} — verifica con la dichiarazione`);
    }

  } else {
    // Nessun F24: usa solo dati dichiarazione
    if (extracted.inpsDed) setField('i-inps-ded', 'inpsDed', extracted.inpsDed);
    if (extracted.accImp)  setField('i-acc-imp',  'accImp',  extracted.accImp);
  }

  // 6. Credito residuo (LM43 - LM44)
  if (extracted.credito != null) setField('i-credito', 'credito', extracted.credito);

  // 7. Dati anno precedente per il confronto grafico
  if (extracted.redLordo) prevYear.redLordo = extracted.redLordo;
  if (extracted.imposta)  prevYear.imposta  = extracted.imposta;
  if (extracted.inpsDov)  prevYear.inpsDov  = extracted.inpsDov;
  if (extracted.fatt)     prevYear.fatt     = extracted.fatt;

  // Conta campi compilati
  const filled = ['i-fatt','i-bolli','i-inps-ded','i-acc-imp','i-acc-inps','i-credito']
    .filter(id => document.getElementById(id)?.classList.contains('auto-filled')).length;

  if (filled > 0) logOk(`Pre-compilati ${filled} campi. Controlla e correggi se necessario, poi premi "Calcola".`);
  else logWarn('Nessun campo pre-compilato — i dati nei PDF potrebbero non essere stati riconosciuti. Compila manualmente.');
}