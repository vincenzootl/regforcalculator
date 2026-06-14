'use strict';

/* ── PDF.js worker ─────────────────────────────────────────── */
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

/* ── STATE ─────────────────────────────────────────────────── */
const extracted = {};
const files = {};
let S = {};
let chartCfr = null, chartAcc = null;
let prevYear = {};

/* ── TOOLTIP CONTENT ───────────────────────────────────────── */
const TIPS = {
  fatt:    { icon:'🧾', title:'Fatturato da FattureInCloud', body:'Totale delle fatture emesse nell\'anno, come appare nel riepilogo di FattureInCloud. Non include le marche da bollo, che aggiungiamo separatamente.', example:'Es.: € 25.000 da FattureInCloud + € 60 di bolli (30 fatture) = € 25.060 da dichiarare' },
  bolli:   { icon:'📮', title:'Fatture con marca da bollo', body:'Ogni fattura emessa in esenzione IVA con importo > € 77,47 richiede una marca da bollo virtuale di € 2,00.', example:'30 fatture × € 2 = € 60 da aggiungere al fatturato dichiarato' },
  coeff:   { icon:'📐', title:'Coefficiente di redditività', body:'Nel regime forfettario non si deducono le spese reali. Il tuo codice ATECO determina una percentuale fissa del fatturato.', example:'Comunicazione/marketing (ATECO 731xxx, 741xxx): 78%. Su € 25.000 → reddito lordo € 19.500' },
  aliq:    { icon:'📊', title:'Imposta sostitutiva', body:'Sostituisce IRPEF e addizionali. È al 5% per i primi 5 anni, poi diventa 15%.', example:'Dopo 5 anni: 15% × € 15.000 di reddito netto = € 2.250 di imposta' },
  inpsDed: { icon:'🔄', title:'Contributi INPS deducibili', body:'Si deduce dal reddito lordo l\'importo dei contributi INPS effettivamente versati nell\'anno solare.', example:'Saldo anno prec. (€ 500) + 1° acconto (€ 1.200) + 2° acconto (€ 1.200) = € 2.900 deducibili' },
  inpsAliq:{ icon:'🏛️', title:'Aliquota INPS Gestione Separata', body:'L\'aliquota 2025 è 26,07% sul reddito lordo forfettario.', example:'26,07% × € 19.500 di reddito lordo = circa € 5.084 di contributi dovuti' },
  accImp:  { icon:'💳', title:'Acconti imposta sostitutiva già versati', body:'Acconti sull\'imposta sostitutiva (codice 1790 + 1791 nei tuoi F24).', example:'1° acconto € 400 + 2° acconto € 400 = € 800 versati durante l\'anno' },
  accInps: { icon:'💳', title:'Acconti INPS già versati', body:'Totale dei versamenti INPS Gestione Separata effettuati durante l\'anno.', example:'Saldo anno prec. (€ 500) + 1° acc. (€ 1.200) + 2° acc. (€ 1.200) = € 2.900' },
  credito: { icon:'✅', title:'Credito anno precedente residuo', body:'Se dalla dichiarazione dell\'anno scorso è emerso un credito non ancora compensato.', example:'LM43 = € 66, LM44 = € 66 → credito residuo = € 0' },
  mesi:    { icon:'📅', title:'Mesi al F24 di giugno', body:'Quanti mesi mancano alla scadenza del F24 di giugno (30 giugno).', example:'6 mesi rimanenti e € 6.000 da versare → € 1.000 al mese da mettere da parte' }
};

function openTip(k) {
  const t = TIPS[k]; if (!t) return;
  document.getElementById('tip-icon').textContent  = t.icon;
  document.getElementById('tip-title').textContent = t.title;
  document.getElementById('tip-body').textContent  = t.body;
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
  if (!el || !uz) return;
  if (names.length) {
    uz.classList.add('has-file');
    el.innerHTML = names.map(n =>
      `<span class="file-badge">✓ ${n.length > 22 ? n.slice(0,20)+'…' : n}</span>`
    ).join('');
  }
}

function log(msg, cls='') {
  const el = document.getElementById('extract-log');
  if (!el) return;
  el.classList.add('visible');
  el.innerHTML += `<div class="${cls}">› ${msg}</div>`;
  el.scrollTop = el.scrollHeight;
}
function logOk(m)   { log(m, 'log-ok'); }
function logWarn(m) { log(m, 'log-warn'); }
function logInfo(m) { log(m, 'log-info'); }
function logErr(m)  { log(m, 'log-err'); }

async function pdfToText(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data: buf}).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
  }
  return text;
}

function parseIT(s) {
  if (!s) return null;
  const clean = String(s).trim().replace(/\./g,'').replace(',','.');
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function extractAmounts(s) {
  const matches = s.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
  return matches.map(parseIT).filter(v => v !== null && v > 0);
}

/* ── HELPER: calcola mesi mancanti al 30 giugno ────────────── */
function calcolaMesiAGiugno() {
  const now   = new Date();
  const giugno = new Date(now.getFullYear(), 5, 30); // 30 giugno anno corrente
  if (now > giugno) {
    // già passato il 30 giugno: punta al prossimo anno
    giugno.setFullYear(giugno.getFullYear() + 1);
  }
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.44;
  const mesi = Math.max(1, Math.round((giugno - now) / msPerMonth));
  return Math.min(12, mesi);
}

/* ── PARSER F24 ──────────────────────────────────────────────── */
function parseF24(text) {
  logInfo('F24: analisi formato PDF...');
  const result = { acc0900: 0, acc1790: 0, acc1791: 0, acc1792: 0, totaleVersato: 0, isRicevuta: false, isGrafico: false };
  const flat   = text.replace(/\s+/g, ' ').trim();

  // ── FORMATO A: Ricevuta di pagamento ──────────────────────────
  // Supporta varianti: "Importo versamento : E. 1.234,56"
  //                    "Importo versamento:E.1.234,56"
  //                    "Importo versamento : € 1.234,56"
  const ricevutaRe = /[Ii]mporto\s+versamento\s*:\s*[Ee€\.]+\s*([\d\.\s]+,\s*\d{2})/g;
  let mRic, totRic = 0, nRic = 0;
  while ((mRic = ricevutaRe.exec(flat)) !== null) {
    const strPulita = mRic[1].replace(/\s+/g, '');
    const v = parseIT(strPulita);
    if (v && v > 0 && v < 100000) { totRic += v; nRic++; logOk(`Ricevuta: € ${fmtEur(v)}`); }
  }
  if (nRic > 0) {
    result.isRicevuta     = true;
    result.totaleVersato  = Math.round(totRic * 100) / 100;
    logInfo(`Trovate ${nRic} ricevuta/e. Totale: € ${fmtEur(result.totaleVersato)}`);
    return result;
  }

  // ── FORMATO C: F24 digitale con codici tributo ────────────────
  const TRIBUTI = [
    { key: 'acc0900', code: '0900', label: 'INPS GS'          },
    { key: 'acc1790', code: '1790', label: 'Imp.sost. 1°acc'  },
    { key: 'acc1791', code: '1791', label: 'Imp.sost. 2°acc'  },
    { key: 'acc1792', code: '1792', label: 'Credito'          },
  ];
  let trovatiCodici = false;
  for (const t of TRIBUTI) {
    // Cerca il codice tributo seguito da un importo nella finestra successiva
    // Tollera spazi attorno al codice: " 0900 " o "0900"
    const re = new RegExp(`(?<![\\d])${t.code}(?![\\d])`, 'g');
    let m;
    while ((m = re.exec(flat)) !== null) {
      const win = flat.slice(m.index + t.code.length, m.index + t.code.length + 100);
      const stdAmounts = extractAmounts(win).filter(v => v >= 10 && v < 30000);
      if (stdAmounts.length) {
        result[t.key] += stdAmounts[0];
        logOk(`Cod.${t.code} (${t.label}): € ${fmtEur(stdAmounts[0])}`);
        trovatiCodici = true;
      }
    }
  }
  if (trovatiCodici) {
    result.totaleVersato = result.acc0900 + result.acc1790 + result.acc1791;
    logInfo(`F24 digitale: totale versato = € ${fmtEur(result.totaleVersato)}`);
    return result;
  }

  // ── FORMATO B: F24 grafico (numeri con spazio: "1.892 06") ───
  result.isGrafico = true;
  const grafAmounts = [];
  const grafRe = /(?<!\d)((?:\d{1,3}\.)*\d{1,3})\s+(\d{2})(?!\d)/g;
  let mGraf;
  while ((mGraf = grafRe.exec(flat)) !== null) {
    const v = parseIT(mGraf[1] + ',' + mGraf[2]);
    if (v && v > 0) grafAmounts.push(v);
  }
  const saldi = grafAmounts.filter(v => v >= 100 && v < 100000);
  if (saldi.length) {
    const saldiSignificativi = [...new Set(saldi.filter(v => v > 1000))].sort((a,b) => b-a);
    result.totaleVersato = saldiSignificativi.length > 0 ? saldiSignificativi[0] : 0;
    logOk(`F24 grafico: saldo estrapolato = € ${fmtEur(result.totaleVersato)}`);
  } else {
    logWarn('F24: nessun importo estratto — PDF potrebbe essere scansionato o formato sconosciuto');
  }

  return result;
}


/* ── PARSER RPF / MODELLO REDDITI ────────────────────────────── */
function parseRPF(text) {
  logInfo('RPF/Redditi: scansione quadro LM e RR...');
  const result = {};
  const flat   = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');

  // ── Helper: cerca un rigo LM e restituisce il primo importo valido ──
  function getLM(rigo, minVal, maxVal) {
    // Accetta: "LM22", "LM 22", "LM022", varianti con zero padding
    const labels = [
      `LM${rigo}`,
      `LM ${rigo}`,
      `LM0${rigo}`,
      `LM ${String(rigo).padStart(2,'0')}`,
    ];
    for (const lbl of labels) {
      let searchFrom = 0;
      while (true) {
        const idx = flat.indexOf(lbl, searchFrom);
        if (idx === -1) break;
        // Verifica che dopo il label non ci sia un altro digit (evita LM220 per LM22)
        const charAfter = flat[idx + lbl.length];
        if (charAfter && /\d/.test(charAfter)) { searchFrom = idx + 1; continue; }

        const chunk           = flat.slice(idx + lbl.length, idx + lbl.length + 400);
        const compressedChunk = chunk.replace(/\s+/g, '');
        const amounts         = compressedChunk.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
        const validAmounts    = amounts.map(parseIT).filter(v =>
          v !== null && v >= (minVal ?? 1) && v <= (maxVal ?? 999999)
        );
        if (validAmounts.length) return validAmounts[0];
        searchFrom = idx + 1;
      }
    }
    return null;
  }

  // ── Fatturato (LM22) ──────────────────────────────────────────
  const lm22 = getLM(22, 100, 500000);
  if (lm22) { result.fatt = lm22; logOk(`LM22 fatturato = € ${fmtEur(lm22)}`); }

  // ── Anno d'imposta dal documento ─────────────────────────────
  // Cerca pattern tipo "Anno d'imposta 2024" o "Periodo d'imposta 2024"
  const annoMatch = flat.match(/(?:anno|periodo)\s+d['']?\s*imposta\s+(\d{4})/i)
                 || flat.match(/\b(20[12]\d)\b.*?(?:LM|reddito|forfettar)/i);
  if (annoMatch) {
    const anno = parseInt(annoMatch[1], 10);
    if (anno >= 2018 && anno <= 2030) {
      result.annoDichiarazione = anno;
      logOk(`Anno d'imposta rilevato: ${anno}`);
    }
  }

  // ── Reddito lordo (LM34) ─────────────────────────────────────
  const lm34 = getLM(34, 100, 500000);
  if (lm34) { result.redLordo = lm34; logOk(`LM34 reddito lordo = € ${fmtEur(lm34)}`); }

  // ── INPS deducibili (LM35) ───────────────────────────────────
  const lm35 = getLM(35, 1, 50000);
  if (lm35) { result.inpsDed = lm35; logOk(`LM35 INPS deducibili = € ${fmtEur(lm35)}`); }

  // ── Reddito netto (LM36) ─────────────────────────────────────
  const lm36 = getLM(36, 1, 500000);
  if (lm36) { result.redNetto = lm36; logOk(`LM36 reddito netto = € ${fmtEur(lm36)}`); }

  // ── Imposta sostitutiva calcolata (LM39) ─────────────────────
  const lm39 = getLM(39, 1, 50000);
  if (lm39) { result.imposta = lm39; logOk(`LM39 imposta sostitutiva = € ${fmtEur(lm39)}`); }

  // ── Credito (LM43, LM44) ─────────────────────────────────────
  result.lm43 = getLM(43, 0.01, 10000);
  result.lm44 = getLM(44, 0.01, 10000);

  // ── Acconti imposta sost. versati (LM45) ─────────────────────
  const lm45 = getLM(45, 1, 50000);
  if (lm45) { result.accImp = lm45; logOk(`LM45 acconti imp.sostitutiva = € ${fmtEur(lm45)}`); }

  // ── Calcolo credito residuo ───────────────────────────────────
  if (result.lm43 != null && result.lm44 != null) {
    result.credito = Math.max(0, result.lm43 - result.lm44);
    logOk(`Credito residuo (LM43 − LM44) = € ${fmtEur(result.credito)}`);
  } else if (result.lm43 != null) {
    result.credito = result.lm43;
    logOk(`Credito residuo (LM43) = € ${fmtEur(result.credito)}`);
  }

  // ── Coefficiente redditività ──────────────────────────────────
  // Cerca "Percentuale" o "Coefficiente" vicino a LM (es. "78,00" o "67,00")
  const coeffMatch = flat.match(/coefficiente\s+di\s+redditivit[aà]\s*[:\-]?\s*(\d{1,2}[,.]\d{0,2})/i)
                  || flat.match(/LM23\D{0,20}?(\d{2}[,.]\d{0,2})/i)
                  || flat.match(/percentuale\s+forfetaria\s*[:\-]?\s*(\d{1,2}[,.]\d{0,2})/i);
  if (coeffMatch) {
    const cv = parseFloat(coeffMatch[1].replace(',', '.'));
    if (cv >= 40 && cv <= 86) {
      result.coeff = cv;
      logOk(`Coefficiente redditività = ${cv}%`);
    }
  }

  // ── Aliquota imposta sostitutiva ─────────────────────────────
  // Cerca "5,00" o "15,00" vicino a "LM38" o "aliquota"
  const aliqMatch = flat.match(/LM38\D{0,30}?(\d{1,2}[,.]\d{0,2})/i)
                 || flat.match(/aliquota\s+imposta\s+sostitutiva\D{0,20}?(\d{1,2}[,.]\d{0,2})/i);
  if (aliqMatch) {
    const av = parseFloat(aliqMatch[1].replace(',', '.'));
    if (av === 5 || av === 15) {
      result.aliqImposta = av;
      logOk(`Aliquota imposta sostitutiva = ${av}%`);
    }
  }

  // ── ALGORITMO PREDITTIVO QUADRO RR (INPS) ────────────────────
  const rrIdx = flat.indexOf('RR5');
  if (rrIdx !== -1) {
    const chunk      = flat.slice(rrIdx, rrIdx + 800);
    const compressed = chunk.replace(/\s+/g, '');
    const amounts    = compressed.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
    const vals       = amounts.map(parseIT).filter(v => v >= 10);
    if (vals.length > 0) {
      const imponibile = Math.max(...vals);
      const target     = imponibile * 0.2607;
      const dovuto     = vals.find(v => Math.abs(v - target) / target < 0.05);
      if (imponibile > 100) {
        result.inpsImponibile = imponibile;
        logOk(`RR5 Imponibile INPS = \u20AC\u00A0${Math.abs(imponibile).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}`);
      }
      if (dovuto) {
        result.inpsDov = dovuto;
        logOk(`RR6 INPS dovuto = \u20AC\u00A0${Math.abs(dovuto).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}`);
      }
    }
  }

  // ── Acconti INPS versati (da quadro RR7/RR8) ─────────────────
  for (const rrRigo of ['RR7','RR8']) {
    const rrAIdx = flat.indexOf(rrRigo);
    if (rrAIdx !== -1 && !result.accInps) {
      const chunk      = flat.slice(rrAIdx, rrAIdx + 300);
      const compressed = chunk.replace(/\s+/g, '');
      const amounts    = compressed.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
      const vals       = amounts.map(parseIT).filter(v => v >= 10 && v < 30000);
      if (vals.length > 0) {
        result.accInps = vals[0];
        logOk(`${rrRigo} Acconti INPS versati = \u20AC\u00A0${Math.abs(vals[0]).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}`);
      }
    }
  }

  const found = Object.keys(result).filter(k => !['lm43','lm44'].includes(k)).length;
  if (found === 0) logWarn('RPF: nessun dato trovato — assicurati che il PDF non sia scansionato come immagine.');
  else logOk(`RPF: estratti ${found} campi.`);

  return result;
}

function parseRedditi(text) { return parseRPF(text); }

/* ── PARSER FattureInCloud XML (SpreadsheetML) ──────────────── */
function parseFIC(text) {
  logInfo('FattureInCloud: estrazione dati XML SpreadsheetML...');
  const result = { fatt: 0, nFatture: 0, fattureCon: 0 };

  // ── Strategia 1: Riga "Totale Annuo" SpreadsheetML ──────────
  // Il file FIC è un SpreadsheetML (Excel-XML).
  // La riga "Totale Annuo" contiene: col1=label, col2=imponibile emesse, col3=IVA, ...
  const totAnnuoIdx = text.indexOf('Totale Annuo');
  if (totAnnuoIdx !== -1) {
    const rowStart = text.lastIndexOf('<Row', totAnnuoIdx);
    const rowEnd   = text.indexOf('</Row>', totAnnuoIdx) + 6;
    const rowText  = text.slice(rowStart, rowEnd);
    const numRe    = /<Data\s+ss:Type="Number">([^<]+)<\/Data>/g;
    const vals     = [];
    let mNum;
    while ((mNum = numRe.exec(rowText)) !== null) {
      const v = parseFloat(mNum[1]);
      if (!isNaN(v) && v > 0) vals.push(v);
    }
    const fatturato = vals.find(v => v >= 100 && v < 500000);
    if (fatturato) {
      result.fatt = Math.round(fatturato * 100) / 100;
      logOk(`Totale Annuo (SpreadsheetML) = \u20AC\u00A0${result.fatt.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}`);
    }
  }

  // ── Strategia 2: fallback — somma totali mensili emesse ─────
  if (!result.fatt) {
    const emesseBlocks = text.split('Fatture emesse');
    let sum = 0;
    for (let i = 1; i < emesseBlocks.length; i++) {
      const block  = emesseBlocks[i].split(/Fatture ricevute|Totale Annuo/)[0];
      const totIdx = block.indexOf('>Totale<');
      if (totIdx !== -1) {
        const rStart  = block.lastIndexOf('<Row', totIdx);
        const rEnd    = block.indexOf('</Row>', totIdx) + 6;
        const rowTxt  = block.slice(rStart, rEnd);
        const numRe2  = /<Data\s+ss:Type="Number">([^<]+)<\/Data>/g;
        let mN, first = true;
        while ((mN = numRe2.exec(rowTxt)) !== null) {
          const v = parseFloat(mN[1]);
          if (first && !isNaN(v) && v > 0) { sum += v; first = false; }
        }
      }
    }
    if (sum >= 100) {
      result.fatt = Math.round(sum * 100) / 100;
      logOk(`Fatturato da totali mensili emesse = \u20AC\u00A0${result.fatt.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}`);
    }
  }

  // ── Conta fatture emesse ─────────────────────────────────────
  // Il formato SpreadsheetML FIC usa ss:Type="DateTime" per le date di ogni fattura
  // Conta solo nelle sezioni "Fatture emesse" (non "ricevute")
  const emesseSections = text.split(/Fatture emesse/g);
  let nFattureEmesse = 0;
  for (let i = 1; i < emesseSections.length; i++) {
    const block = emesseSections[i].split(/Fatture ricevute|Totale Annuo|>Totale</)[0];
    nFattureEmesse += (block.match(/ss:Type="DateTime"/g) || []).length;
  }
  if (nFattureEmesse > 0) {
    result.nFatture = nFattureEmesse;
    logOk(`Fatture emesse contate: ${nFattureEmesse}`);
  }

  // ── Conta fatture con bollo (imponibile > 77,47 per fattura) ─
  // Nel forfettario IVA=0. Ogni Row di dati con imponibile > 77,47 = bollo
  let conBollo = 0;
  for (let i = 1; i < emesseSections.length; i++) {
    const block  = emesseSections[i].split(/Fatture ricevute|Totale Annuo|>Totale</)[0];
    // Considera solo le righe con un DateTime (= riga di fattura, non header)
    const rowRe  = /<Row>((?:(?!<Row>)[\s\S])*?ss:Type="DateTime"(?:(?!<Row>)[\s\S])*?)<\/Row>/g;
    let mRow;
    while ((mRow = rowRe.exec(block)) !== null) {
      // Trova primo Number > 0 nella riga (= imponibile)
      const numM = mRow[1].match(/<Data\s+ss:Type="Number">([\d.]+)<\/Data>/);
      if (numM) {
        const imponibile = parseFloat(numM[1]);
        if (!isNaN(imponibile) && imponibile > 77.47) conBollo++;
      }
    }
  }
  if (conBollo > 0) {
    result.fattureCon = conBollo;
    logOk(`Fatture con marca da bollo (imponibile > 77,47): ${conBollo}`);
  } else if (result.nFatture > 0) {
    result.fattureCon = result.nFatture;
    logInfo(`Bolli: impossibile discriminare importo, uso totale fatture: ${result.nFatture}`);
  }

  if (result.fatt > 0) {
    logInfo('ℹ️ FIC: estrae fatturato e n. fatture. Per INPS/acconti/credito carica i PDF della dichiarazione (RPF) e i tuoi F24.');
  }

  return result;
}

/* ── PROCESS FILES E MERGE ──────────────────────────────────── */
async function processFiles(fileList, type) {
  setBadge(type, fileList.map(f => f.name));
  files[type] = fileList;

  for (const file of fileList) {
    try {
      let parsed = {};
      const isPDF = file.name.toLowerCase().endsWith('.pdf');
      const isXML = /\.(xml)$/i.test(file.name);
      const isCSV = /\.(csv)$/i.test(file.name);

      if (isPDF) {
        const text = await pdfToText(file);
        if      (type === 'f24')     parsed = parseF24(text);
        else if (type === 'rpf')     parsed = parseRPF(text);
        else if (type === 'redditi') parsed = parseRedditi(text);
      } else if (isXML || isCSV) {
        const text = await file.text();
        if (type === 'fic') parsed = parseFIC(text);
      }

      // ── MERGE INTELLIGENTE ────────────────────────────────────
      for (const [key, val] of Object.entries(parsed)) {
        if (val == null || val === false) continue;

        // Campi da sommare (più F24, più file FIC)
        const ACCUMULATE = ['totaleVersato','acc0900','acc1790','acc1791','acc1792','fatt','nFatture','fattureCon'];
        if (ACCUMULATE.includes(key)) {
          if (val === 0) continue;
          extracted[key] = (extracted[key] || 0) + val;
        } else if (key === 'isRicevuta' || key === 'isGrafico') {
          extracted[key] = extracted[key] || val;
        } else {
          // Per campi scalari (dichiarazione), non sovrascrivere se già valorizzato
          // a meno che il nuovo valore non sia più preciso (non zero)
          if (val !== 0 || extracted[key] == null) extracted[key] = val;
        }
      }

    } catch(e) {
      logErr(`Errore lettura ${file.name}: ${e.message}`);
    }
  }

  updateExtractedPills();
  prefillFields();
}

/* ── UI E PREFILL ──────────────────────────────────────────── */
const PILL_DEFS = [
  { key:'fatt',          label:'Fatturato',            src:'RPF/FIC' },
  { key:'inpsDed',       label:'INPS deducibili',       src:'RPF/F24' },
  { key:'accImp',        label:'Acconti imp. sost.',    src:'RPF'     },
  { key:'credito',       label:'Credito residuo',       src:'RPF'     },
  { key:'acc0900',       label:'Versato INPS (0900)',   src:'F24'     },
  { key:'acc1790',       label:'Versato imp. (1790)',   src:'F24'     },
  { key:'imposta',       label:'Imposta sost. (LM39)',  src:'RPF'     },
  { key:'redLordo',      label:'Reddito lordo (LM34)',  src:'RPF'     },
  { key:'inpsDov',       label:'INPS dovuto (RR6)',     src:'RPF'     },
  { key:'nFatture',      label:'N. fatture',            src:'FIC'     },
  { key:'fattureCon',    label:'Fatture con bollo',     src:'FIC'     },
  { key:'coeff',         label:'Coeff. redditività',    src:'RPF', fmt: v => v+'%' },
  { key:'aliqImposta',   label:'Aliquota imposta',      src:'RPF', fmt: v => v+'%' },
  { key:'annoDichiarazione', label:'Anno d\'imposta',   src:'RPF', fmt: v => String(v) },
];

function fmtEur(v) { return '\u20AC\u00A0' + Math.abs(v).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtInt(v) { return '\u20AC\u00A0' + Math.round(Math.abs(v)).toLocaleString('it-IT'); }

function updateExtractedPills() {
  const container = document.getElementById('extracted-pills');
  if (!container) return;
  const pills = PILL_DEFS.filter(d => {
    const v = extracted[d.key];
    return v != null && v !== 0 && v !== false;
  });
  if (!pills.length) { container.style.display = 'none'; return; }
  container.style.display = 'grid';
  container.innerHTML = pills.map(d => {
    const raw  = extracted[d.key];
    const disp = d.fmt ? d.fmt(raw) : fmtEur(raw);
    return `
    <div class="ex-pill">
      <div class="ex-pill-src">${d.src}</div>
      <div class="ex-pill-lbl">${d.label}</div>
      <div class="ex-pill-val">${disp}</div>
    </div>`;
  }).join('');
}

function setSrc(fieldId, isAuto) {
  const el = document.getElementById('src-' + fieldId);
  if (!el) return;
  if (isAuto) { el.textContent = 'da documento'; el.classList.remove('manual'); }
  else        { el.textContent = 'manuale';       el.classList.add('manual');   }
}

function setField(inputId, srcId, value) {
  if (value == null) return;
  const el = document.getElementById(inputId);
  if (!el) return;
  el.value = Math.round(value * 100) / 100;
  el.classList.add('auto-filled');
  setSrc(srcId, true);
}

/* ── PREFILL COMPLETO ────────────────────────────────────────── */
function prefillFields() {

  // ── Fatturato ─────────────────────────────────────────────────
  if (extracted.fatt)     setField('i-fatt', 'fatt', extracted.fatt);

  // ── Marche da bollo ───────────────────────────────────────────
  // Priorità: fattureCon (discriminato da IVA) > nFatture (totale)
  const nBolli = extracted.fattureCon || extracted.nFatture || null;
  if (nBolli)             setField('i-bolli', 'bolli', nBolli);

  // ── Coefficiente redditività ──────────────────────────────────
  if (extracted.coeff) {
    setField('i-coeff', 'coeff', extracted.coeff);
    logOk(`Coefficiente redditività precompilato: ${extracted.coeff}%`);
  }

  // ── Aliquota imposta sostitutiva ──────────────────────────────
  if (extracted.aliqImposta) {
    setField('i-aliq', 'aliq', extracted.aliqImposta);
    logOk(`Aliquota imposta sostitutiva precompilata: ${extracted.aliqImposta}%`);
  }

  // ── Mesi al F24 di giugno (calcolo automatico) ────────────────
  const elMesi = document.getElementById('i-mesi');
  if (elMesi && !elMesi.classList.contains('auto-filled')) {
    const mesiAuto = calcolaMesiAGiugno();
    elMesi.value = mesiAuto;
    elMesi.classList.add('auto-filled');
    setSrc('mesi', true);
    logInfo(`Mesi al F24 di giugno calcolati automaticamente: ${mesiAuto}`);
  }

  // ── INPS deducibili e acconti F24 ────────────────────────────
  const hasCodici  = (extracted.acc0900 || 0) + (extracted.acc1790 || 0) + (extracted.acc1791 || 0) > 0;
  const hasRicevuta = extracted.isRicevuta && extracted.totaleVersato > 0;

  if (hasCodici) {
    // F24 digitale con codici tributo — massima precisione
    const inpsDed = extracted.acc0900 > 0
      ? extracted.acc0900
      : (extracted.inpsDed || null);
    if (inpsDed) setField('i-inps-ded', 'inpsDed', inpsDed);

    const accImpF24 = (extracted.acc1790 || 0) + (extracted.acc1791 || 0);
    const accImp    = extracted.accImp || (accImpF24 > 0 ? accImpF24 : null);
    if (accImp)     setField('i-acc-imp', 'accImp', accImp);

    if (extracted.acc0900 > 0) setField('i-acc-inps', 'accInps', extracted.acc0900);

  } else if (hasRicevuta || extracted.isGrafico) {
    // F24 ricevuta/grafico — usa dati RPF se disponibili, altrimenti stima
    if (extracted.inpsDed) setField('i-inps-ded', 'inpsDed', extracted.inpsDed);
    if (extracted.accImp)  setField('i-acc-imp',  'accImp',  extracted.accImp);

    // Stima acconti INPS dal totale F24 - acconti imposta
    const totF24     = extracted.totaleVersato || 0;
    const accImpNota = extracted.accImp || 0;
    const accInpsStima = Math.max(0, totF24 - accImpNota);
    if (accInpsStima > 0 && !extracted.inpsDed) {
      setField('i-acc-inps', 'accInps', accInpsStima);
      logWarn(`Acconti INPS stimati da F24 totale − acconti imp.sost.: € ${fmtEur(accInpsStima)}`);
    }

    // Usa anche accInps dal quadro RR se estratto
    if (extracted.accInps && !document.getElementById('i-acc-inps')?.classList.contains('auto-filled')) {
      setField('i-acc-inps', 'accInps', extracted.accInps);
    }

  } else {
    // Solo RPF — dati dalla dichiarazione
    if (extracted.inpsDed) setField('i-inps-ded', 'inpsDed', extracted.inpsDed);
    if (extracted.accImp)  setField('i-acc-imp',  'accImp',  extracted.accImp);
    if (extracted.accInps) setField('i-acc-inps', 'accInps', extracted.accInps);
  }

  // ── Credito anno precedente ───────────────────────────────────
  if (extracted.credito != null) setField('i-credito', 'credito', extracted.credito);

  // ── Dati anno precedente per il confronto ─────────────────────
  if (extracted.redLordo) prevYear.redLordo = extracted.redLordo;
  if (extracted.imposta)  prevYear.imposta  = extracted.imposta;
  if (extracted.inpsDov)  prevYear.inpsDov  = extracted.inpsDov;
  if (extracted.fatt)     prevYear.fatt     = extracted.fatt;

  // ── Riepilogo prefill ─────────────────────────────────────────
  const campiMonitorati = ['i-fatt','i-bolli','i-coeff','i-aliq','i-inps-ded','i-acc-imp','i-acc-inps','i-credito','i-mesi'];
  const filled = campiMonitorati.filter(id => document.getElementById(id)?.classList.contains('auto-filled')).length;

  if (filled > 0) logOk(`Pre-compilati ${filled}/${campiMonitorati.length} campi. Controlla e correggi se necessario, poi premi "Calcola".`);
  else            logWarn('Nessun campo pre-compilato — i dati nei PDF potrebbero non essere stati riconosciuti. Compila manualmente.');

  // ── Avviso campi critici mancanti ────────────────────────────
  const critico = ['i-fatt','i-inps-ded'];
  critico.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('auto-filled') && !el.value) {
      logWarn(`Campo "${el.placeholder || id}" non compilato automaticamente — inserisci manualmente.`);
    }
  });
}