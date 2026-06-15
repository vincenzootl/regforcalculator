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
  inpsDed: {
    icon:'🔄',
    title:'Contributi INPS deducibili',
    body:'Sono deducibili i contributi INPS effettivamente versati nell\'anno solare (non quelli "di competenza"). Include: il saldo anno precedente versato a giugno + il 1° e 2° acconto versati durante l\'anno. NON include il saldo dell\'anno in corso (che pagherai il prossimo giugno).',
    example:'Esempio 2025: saldo 2024 versato a giugno 2025 (€682) + 1° acconto 2025 (€1.892) + 2° acconto 2025 (€1.892) = €4.466 deducibili. Cerca nei tuoi F24 con codice 0900.'
  },
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
  if (n === 1 && Object.keys(files).length === 0) {
    logWarn('Nessun documento caricato — dovrai inserire tutti i valori manualmente.');
  }
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

/* ── HELPER: mesi mancanti al 30 giugno ────────────────────── */
function calcolaMesiAGiugno() {
  const now    = new Date();
  const giugno = new Date(now.getFullYear(), 5, 30);
  if (now > giugno) giugno.setFullYear(giugno.getFullYear() + 1);
  const mesi = Math.max(1, Math.round((giugno - now) / (1000 * 60 * 60 * 24 * 30.44)));
  return Math.min(12, mesi);
}

/* ── PARSER F24 ──────────────────────────────────────────────── */
// Dati reali (F24_PVNVCN93R12A662R_RPF25):
//   Ricevuta:  "Importo versamento : E. 2.819,06"
//   Digitale:  "1792 0101 2024 66 00"
//              "1790 0101 2025 311 00"
//              "0900 PXX 01 2025 12 2025 1.892 06"
//              "0900 PXX 01 2024 12 2024 682 00"
function parseF24(text) {
  logInfo('F24: analisi formato PDF...');
  const result = { acc0900: 0, acc1790: 0, acc1791: 0, acc1792: 0, accInps: 0, totaleVersato: 0, isRicevuta: false, isGrafico: false };
  const pagesText = text.split('\n').filter(p => p.trim().length > 0);

  // ── Sezione Ricevute (formato piatto globale) ─────────────────
  const flatGlobal = text.replace(/\s+/g,' ').trim();
  const ricevutaRe = /[Ii]mporto\s+versamento\s*:\s*[Ee€\.\s]+\s*([\d\.\s]+,\s*\d{2})/g;
  let mRic, totRic = 0, nRic = 0;
  while ((mRic = ricevutaRe.exec(flatGlobal)) !== null) {
    const v = parseIT(mRic[1].replace(/\s+/g, ''));
    if (v && v > 0 && v < 100000) { totRic += v; nRic++; logOk(`Ricevuta: € ${fmtEur(v)}`); }
  }
  if (nRic > 0) {
    result.isRicevuta    = true;
    result.totaleVersato = Math.round(totRic * 100) / 100;
    logInfo(`Trovate ${nRic} ricevuta/e. Totale: € ${fmtEur(result.totaleVersato)}`);
    return result;
  }

  // ── Sezione F24 Digitale con deduplicazione pagine ────────────
  const pageSignatures = new Set();
  let trovati = false;
  let maxYear = 0;

  for (let idx = 0; idx < pagesText.length; idx++) {
    const pText = pagesText[idx];
    const flat = pText.replace(/\s+/g,' ');

    // Estrai tutti i tributi di questa pagina
    const pageRecords = [];
    
    // Regex per 0900 (INPS GS)
    const re0900 = /(0900)\s+([A-Z0-9]{3})\s+(\d{2}\s+\d{4}\s+\d{2}\s+\d{4})\s+((?:\d{1,3}(?:\.\d{3})*|\d+)(?:[\s,]\d{2}))/g;
    let m;
    while ((m = re0900.exec(flat)) !== null) {
      const amt = parseIT(m[4].replace(/\s+/, ','));
      if (amt && amt > 0) {
        pageRecords.push({ code: '0900', key: `${m[2]}_${m[3]}`, amt });
      }
    }

    // Regex per altri tributi (1790, 1791, 1792)
    const reErario = /(1790|1791|1792)\s+(?:(\d{4})\s+)?(\d{4})\s+((?:\d{1,3}(?:\.\d{3})*|\d+)(?:[\s,]\d{2}))/ig;
    let me;
    while ((me = reErario.exec(flat)) !== null) {
      const code = me[1].toUpperCase();
      const amt = parseIT(me[4].replace(/\s+/, ','));
      if (amt && amt > 0) {
        pageRecords.push({ code, key: `${me[2]||'none'}_${me[3]}`, amt });
      }
    }

    if (pageRecords.length === 0) continue;

    // Crea firma per la pagina basata sui record trovati
    pageRecords.sort((a,b) => (a.code+a.key).localeCompare(b.code+b.key));
    const sig = pageRecords.map(r => `${r.code}:${r.key}:${r.amt.toFixed(2)}`).join('|');

    if (pageSignatures.has(sig)) {
      logInfo(`F24: pagina ${idx+1} ignorata (duplicato)`);
      continue;
    }
    pageSignatures.add(sig);

    // Determina l'anno massimo per identificare gli acconti correnti
    for (const r of pageRecords) {
      const years = r.key.match(/\b20\d{2}\b/g) || [];
      for (const y of years) {
        const yi = parseInt(y, 10);
        if (yi > maxYear) maxYear = yi;
      }
    }

    // Accumula i valori di questa pagina unica
    for (const r of pageRecords) {
      const resKey = `acc${r.code}`;
      if (resKey in result) {
        result[resKey] += r.amt;
        logOk(`Trovato Cod.${r.code} su pag.${idx+1}: € ${fmtEur(r.amt)}`);
        trovati = true;
      }
      
      // Salva acconti INPS GS specificamente se riferiti all'anno corrente (maxYear)
      if (r.code === '0900') {
        const years = r.key.match(/\b20\d{2}\b/g) || [];
        if (years.length > 0 && parseInt(years[years.length - 1], 10) === maxYear) {
          result.accInps += r.amt;
          logInfo(`Cod.0900 su pag.${idx+1} registrato come Acconto INPS: € ${fmtEur(r.amt)}`);
        }
      }
    }
  }

  if (trovati) {
    // Round per precisione float
    result.acc0900 = Math.round(result.acc0900 * 100) / 100;
    result.acc1790 = Math.round(result.acc1790 * 100) / 100;
    result.acc1791 = Math.round(result.acc1791 * 100) / 100;
    result.acc1792 = Math.round(result.acc1792 * 100) / 100;
    result.accInps = Math.round(result.accInps * 100) / 100;

    result.totaleVersato = Math.round((result.acc0900 + result.acc1790 + result.acc1791) * 100) / 100;
    logInfo(`F24 digitale: totale versato = € ${fmtEur(result.totaleVersato)}`);
    return result;
  }

  // Grafico puro
  result.isGrafico = true;
  const grafAmounts = [];
  const grafRe2 = /(?<!\d)((?:\d{1,3}\.)*\d{1,3})\s+(\d{2})(?!\d)/g;
  let mG;
  while ((mG = grafRe2.exec(flatGlobal)) !== null) {
    const v = parseIT(mG[1] + ',' + mG[2]);
    if (v && v > 0) grafAmounts.push(v);
  }
  const saldi = grafAmounts.filter(v => v >= 100 && v < 100000);
  if (saldi.length) {
    const sig = [...new Set(saldi.filter(v => v > 1000))].sort((a,b) => b-a);
    result.totaleVersato = sig.length > 0 ? sig[0] : 0;
    logOk(`F24 grafico: saldo = € ${fmtEur(result.totaleVersato)}`);
  } else {
    logWarn('F24: nessun importo estratto — PDF potrebbe essere scansionato');
  }
  return result;
}


/* ── PARSER RPF / MODELLO REDDITI ────────────────────────────── */
// Dati reali (PVNVCN93R12A662R_RPF25.pdf):
//   Pag.5 flat: "...LM 22 LM3 4 LM3 5 LM3 6 LM3 7 LM3 8 LM3 9...
//                731102   78   5.815   4.536   2  742019 78 5.815 4.536 2...
//                18.144  5.695  5.695  12.449  12.449  622"
//   Pag.6 flat: "622  688  66"
//   LM43=66, LM44=66 → credito=0
//   Pag.4 RR: "18.144  1  12  C  4.730  4.048  4.730  4.048  682  4.730  682"
function parseRPF(text) {
  logInfo('RPF/Redditi: scansione quadro LM e RR...');
  const result = {};
  const pagesText = text.split('\n').filter(p => p.trim().length > 0);
  const flatGlobal = text.replace(/\r\n|\r|\n/g,' ').replace(/[ \t]+/g,' ');

  // Anno d'imposta
  const annoM = flatGlobal.match(/PERIODO\s+D['']?\s*IMPOSTA\s+(\d{4})/i)
             || flatGlobal.match(/(?:anno|periodo)\s+d['']?\s*imposta\s+(\d{4})/i);
  if (annoM) {
    const a = parseInt(annoM[1],10);
    if(a>=2018&&a<=2030) { result.annoDichiarazione = a; logOk(`Anno d'imposta: ${a}`); }
  }

  // Cerca la pagina 5 (quadro LM Sezione III)
  let lmPageText = "";
  for (const txt of pagesText) {
    if (txt.includes("QUADRO LM") || txt.includes("SEZIONE III") || txt.includes("LM 22")) {
      lmPageText = txt;
      break;
    }
  }

  if (lmPageText) {
    const flatLM = lmPageText.replace(/\r\n|\r|\n/g,' ').replace(/[ \t]+/g,' ');
    
    // Trova tutti i codici ATECO (6 cifre)
    const atecoRe = /\b\d{6}\b/g;
    const atecoMatches = [];
    let m;
    while ((m = atecoRe.exec(flatLM)) !== null) {
      atecoMatches.push({ code: m[0], index: m.index });
    }

    if (atecoMatches.length > 0) {
      // Prendi l'ultimo ATECO per cercare i totali dopo di esso
      const lastAteco = atecoMatches[atecoMatches.length - 1];
      const afterAtecoText = flatLM.slice(lastAteco.index);
      
      // Estrai tutti i numeri (interi e decimali italiani) dopo l'ultimo ATECO
      const numRe = /\b\d{1,3}(?:\.\d{3})*(?:,\d{2})?\b|\b\d+\b/g;
      const vals = [];
      let mn;
      while ((mn = numRe.exec(afterAtecoText)) !== null) {
        const parsed = parseIT(mn[0]);
        if (parsed !== null) vals.push(parsed);
      }

      // La sequenza di totali di fine quadro LM contiene almeno 6 elementi:
      // [RedditoLordo, INPSDeducibile, INPSDeducibile_rip, RedditoNetto, RedditoNetto_rip, ImpostaSostitutiva]
      if (vals.length >= 6) {
        const totali = vals.slice(vals.length - 6);
        result.fatt = totali[0];
        result.redLordo = totali[0];
        result.inpsDed = totali[1];
        result.redNetto = totali[3];
        result.imposta = totali[5];
        
        logOk(`LM22 fatturato = € ${fmtEur(result.fatt)}`);
        logOk(`LM34 reddito lordo = € ${fmtEur(result.redLordo)}`);
        logOk(`LM35 INPS deducibili = € ${fmtEur(result.inpsDed)}`);
        logOk(`LM36 reddito netto = € ${fmtEur(result.redNetto)}`);
        logOk(`LM39 imposta sostitutiva = € ${fmtEur(result.imposta)}`);
      }

      // Estrai il coefficiente di redditività dell'attività principale
      for (const aMatch of atecoMatches) {
        const localAfter = flatLM.slice(aMatch.index + 6, aMatch.index + 100);
        const coeffM = localAfter.match(/\b(40|54|62|67|78|86)\b/);
        if (coeffM) {
          result.coeff = parseInt(coeffM[1], 10);
          logOk(`Coefficiente redditività (da dati ATECO) = ${result.coeff}%`);
          break;
        }
      }
    }

    // Aliquota calcolata
    if (result.redNetto && result.imposta) {
      const ratio = (result.imposta / result.redNetto) * 100;
      if (Math.abs(ratio - 5) < 2.5) { result.aliqImposta = 5; logOk(`Aliquota imposta = 5%`); }
      else if (Math.abs(ratio - 15) < 2.5) { result.aliqImposta = 15; logOk(`Aliquota imposta = 15%`); }
    }
  }

  // ── RX Sezione / Credito residuo ──────────────────────────────
  let rxPageText = "";
  for (const txt of pagesText) {
    if (txt.includes("QUADRO RX") || txt.includes("RX31")) {
      rxPageText = txt;
      break;
    }
  }

  if (rxPageText) {
    const flatRX = rxPageText.replace(/\r\n|\r|\n/g,' ').replace(/[ \t]+/g,' ');
    const rx31idx = flatRX.indexOf("RX31");
    if (rx31idx !== -1) {
      // Estrai tutti i numeri non-zero dopo RX31
      const afterRX31 = flatRX.slice(rx31idx);
      const numRe = /\b\d{1,3}(?:\.\d{3})*(?:,\d{2})?\b|\b\d+\b/g;
      const rxVals = [];
      let mrx;
      while ((mrx = numRe.exec(afterRX31)) !== null) {
        const val = parseIT(mrx[0]);
        if (val && val > 0 && val < 50000) rxVals.push(val);
      }
      if (rxVals.length >= 2) {
        result.lm43 = rxVals[0];
        result.lm44 = rxVals[1];
        result.credito = Math.max(0, result.lm43 - result.lm44);
        logOk(`Credito residuo (LM43 − LM44) = € ${fmtEur(result.credito)}`);
      }
    }
  }

  // Fallback se RX31 non trovato, cerca LM43/LM44 a fine pagina 6
  if (result.lm43 === undefined) {
    let p6Text = "";
    for (const txt of pagesText) {
      if (txt.includes("LM43") || txt.includes("LM44")) {
        p6Text = txt;
        break;
      }
    }
    if (p6Text) {
      const flat6 = p6Text.replace(/\s+/g,' ');
      const numRe = /\b(\d{1,3}(?:\.\d{3})*)\b/g;
      let m, nums = [];
      while ((m = numRe.exec(flat6)) !== null) {
        const val = parseIT(m[1]);
        if (val && val > 0) nums.push(val);
      }
      if (nums.length > 0) {
        const lastVal = nums[nums.length - 1];
        if (lastVal < 10000) {
          result.lm43 = lastVal;
          result.lm44 = lastVal;
          result.credito = 0;
          logOk(`Credito residuo (LM43 − LM44) = € ${fmtEur(result.credito)}`);
        }
      }
    }
  }

  // Estrazione LM47 imposta a credito
  let flatPage = "";
  for (const txt of pagesText) {
    if (txt.includes("LM47") || txt.includes("LM42") || txt.includes("LM46")) {
      flatPage = txt.replace(/\s+/g,' ');
      break;
    }
  }
  if (flatPage) {
    const lm47m = flatPage.match(/LM\s*47[^\d]*([\d.,]+)/);
    if (lm47m) {
      result.lm47 = parseIT(lm47m[1]);
      logOk(`LM47 imposta a credito = € ${fmtEur(result.lm47)}`);
    }
  }

  // ── RR Sezione (INPS) ─────────────────────────────────────────
  let rrPageText = "";
  for (const txt of pagesText) {
    if (txt.includes("QUADRO RR") || txt.includes("RR5") || txt.includes("RR 5")) {
      rrPageText = txt;
      break;
    }
  }

  if (rrPageText) {
    const flatRR = rrPageText.replace(/\r\n|\r|\n/g,' ').replace(/[ \t]+/g,' ');
    const rrIdx = flatRR.indexOf("RR5") !== -1 ? flatRR.indexOf("RR5") : flatRR.indexOf("RR 5");
    if (rrIdx !== -1) {
      const afterRR = flatRR.slice(rrIdx);
      const numRe = /\b\d{1,3}(?:\.\d{3})*(?:,\d{2})?\b|\b\d+\b/g;
      const rrVals = [];
      let mrr;
      while ((mrr = numRe.exec(afterRR)) !== null) {
        const val = parseIT(mrr[0]);
        if (val && val >= 100) rrVals.push(val);
      }
      const uniqueVals = [...new Set(rrVals)].sort((a,b) => b-a);
      if (uniqueVals.length >= 4) {
        result.inpsImponibile = uniqueVals[0];
        result.inpsDov        = uniqueVals[1];
        result.inpsSaldo      = uniqueVals[3];
        logOk(`RR5 Imponibile INPS = € ${fmtEur(result.inpsImponibile)}`);
        logOk(`RR6 INPS dovuto = € ${fmtEur(result.inpsDov)}`);
        logOk(`RR9 INPS saldo a debito = € ${fmtEur(result.inpsSaldo)}`);
      } else if (uniqueVals.length >= 2) {
        result.inpsImponibile = uniqueVals[0];
        result.inpsDov        = uniqueVals[1];
        logOk(`RR5 Imponibile INPS = € ${fmtEur(result.inpsImponibile)}`);
        logOk(`RR6 INPS dovuto = € ${fmtEur(result.inpsDov)}`);
      }
    }
  }

  const found = Object.keys(result).filter(k=>!['lm43','lm44'].includes(k)).length;
  if (found === 0) logWarn('RPF: nessun dato trovato.');
  else logOk(`RPF: estratti ${found} campi.`);
  return result;
}

function parseRedditi(text) { return parseRPF(text); }


/* ── PARSER FattureInCloud XML (SpreadsheetML) ──────────────── */
// Dati reali (riepilogo economico.xml):
//   Riga "Totale Annuo" (riga 1649):
//     Col1: "Totale Annuo"  Col2: 30396 (imponibile emesse)
//     Col3: 2482.64 (IVA, dovrebbe essere 0 in forfettario ma qui ha qualcosa)
//     Col4: 27913.36 (imponibile netto dopo correzioni ammortamenti)
//   Date fatture: ss:Type="DateTime" con valore "2025-01-14T00:00:00.000"
//   IMPORTANTE: contare SOLO le sezioni "Fatture emesse", NON "Fatture ricevute"
function parseFIC(text) {
  logInfo('FattureInCloud: estrazione dati XML SpreadsheetML...');
  const result = { fatt: 0, nFatture: 0, fattureCon: 0 };

  // ── Fatturato: Riga "Totale Annuo" ───────────────────────────
  // La prima cella numerica dopo "Totale Annuo" = imponibile lordo emesse
  const totAnnuoIdx = text.indexOf('Totale Annuo');
  if (totAnnuoIdx !== -1) {
    const rowStart = text.lastIndexOf('<Row', totAnnuoIdx);
    const rowEnd   = text.indexOf('</Row>', totAnnuoIdx) + 6;
    if (rowStart !== -1 && rowEnd > rowStart) {
      const rowText = text.slice(rowStart, rowEnd);
      const numRe   = /<Data\s+ss:Type="Number">([^<]+)<\/Data>/g;
      const vals    = [];
      let mNum;
      while ((mNum = numRe.exec(rowText)) !== null) {
        const v = parseFloat(mNum[1]);
        if (!isNaN(v) && v > 0) vals.push(v);
      }
      // Prima cella numerica >= 100 = imponibile lordo (es. 30396)
      const fatturato = vals.find(v => v >= 100 && v < 500000);
      if (fatturato) {
        result.fatt = Math.round(fatturato * 100) / 100;
        logOk(`Totale Annuo fatturato = € ${fmtEur(result.fatt)}`);
      }
    }
  }

  // ── Fallback: somma prima cella numerica di ogni "Totale" mensile emesse ──
  if (!result.fatt) {
    const blocks = text.split('Fatture emesse');
    let sum = 0;
    for (let i = 1; i < blocks.length; i++) {
      const block  = blocks[i].split(/Fatture ricevute|Totale Annuo/)[0];
      const totIdx = block.indexOf('>Totale<');
      if (totIdx === -1) continue;
      const rStart = block.lastIndexOf('<Row', totIdx);
      const rEnd   = block.indexOf('</Row>', totIdx) + 6;
      if (rStart === -1 || rEnd <= rStart) continue;
      const rowTxt = block.slice(rStart, rEnd);
      const numRe2 = /<Data\s+ss:Type="Number">([^<]+)<\/Data>/g;
      let mN, first = true;
      while ((mN = numRe2.exec(rowTxt)) !== null) {
        const v = parseFloat(mN[1]);
        if (first && !isNaN(v) && v > 0) { sum += v; first = false; }
      }
    }
    if (sum >= 100) {
      result.fatt = Math.round(sum * 100) / 100;
      logOk(`Fatturato da totali mensili = € ${fmtEur(result.fatt)}`);
    }
  }

  // ── Conta fatture emesse (solo sezioni "Fatture emesse") ─────
  // Ogni riga con ss:Type="DateTime" in una sezione "Fatture emesse" = 1 fattura
  // ESCLUDE le sezioni "Fatture ricevute"
  const emesseSections = text.split(/Fatture emesse/g);
  let nFattureEmesse = 0;
  for (let i = 1; i < emesseSections.length; i++) {
    // Tronca alla prima occorrenza di "Fatture ricevute" o "Totale Annuo"
    const block = emesseSections[i].split(/Fatture ricevute|Totale Annuo/)[0];
    // Conta solo le righe con DateTime (= righe di singola fattura, non Totale né header)
    nFattureEmesse += (block.match(/ss:Type="DateTime"/g) || []).length;
  }
  if (nFattureEmesse > 0) {
    result.nFatture = nFattureEmesse;
    logOk(`Fatture emesse: ${nFattureEmesse}`);
  }

  // ── Conta fatture con bollo (imponibile > 77,47 per fattura emessa) ──
  // Nel forfettario IVA=0 → ogni fattura emessa con imponibile > 77,47 richiede bollo
  let conBollo = 0;
  for (let i = 1; i < emesseSections.length; i++) {
    const block = emesseSections[i].split(/Fatture ricevute|Totale Annuo/)[0];
    // Ogni Row con DateTime è una riga fattura
    // Pattern Row che contiene DateTime: può essere Row semplice o Row con attributi
    const rowRe = /<Row[^>]*>([\s\S]*?)<\/Row>/g;
    let mRow;
    while ((mRow = rowRe.exec(block)) !== null) {
      const rowContent = mRow[1];
      // Deve contenere DateTime (= riga di fattura)
      if (!rowContent.includes('ss:Type="DateTime"')) continue;
      // Cerca il primo Number > 0 nella riga (= imponibile)
      const firstNumM = rowContent.match(/<Data\s+ss:Type="Number">([\d.]+)<\/Data>/);
      if (firstNumM) {
        const imp = parseFloat(firstNumM[1]);
        if (!isNaN(imp) && imp > 77.47) conBollo++;
      }
    }
  }
  if (conBollo > 0) {
    result.fattureCon = conBollo;
    logOk(`Fatture con marca da bollo (>77,47): ${conBollo}`);
  } else if (result.nFatture > 0) {
    result.fattureCon = result.nFatture;
    logInfo(`Bolli: non discriminato, uso totale fatture emesse: ${result.nFatture}`);
    if (result.fattureCon === result.nFatture && conBollo === 0) {
      logWarn(`Bolli: impossibile discriminare — usato totale fatture (${result.nFatture}) come stima. Verifica manualmente.`);
    }
  }

  if (result.fatt > 0) {
    logInfo('ℹ️ FIC: estrae fatturato e n. fatture. Per INPS/acconti/credito carica i PDF RPF e F24.');
  }
  return result;
}


/* ── PROCESS FILES E MERGE ──────────────────────────────────── */
async function processFiles(fileList, type) {
  files[type] = fileList;

  // Reset visivo badge solo per lo slot corrente (gli altri mantengono il loro stato)
  document.querySelectorAll('.upload-zone').forEach(uz => {
    if (!uz.classList.contains('has-file')) return;
    // già gestito da setBadge — nessuna azione necessaria
  });

  // Aggiorna i badge per tutti gli slot
  for (const [slotType, list] of Object.entries(files)) {
    if (list) setBadge(slotType, list.map(f => f.name));
  }

  // Resetta lo stato estratto per ricalcolarlo in modo pulito da tutti i file attualmente caricati
  for (const k of Object.keys(extracted)) delete extracted[k];
  for (const k of Object.keys(prevYear)) delete prevYear[k];

  const elWarn = document.getElementById('aliq-warning');
  if (elWarn) { elWarn.style.display = 'none'; elWarn.innerHTML = ''; }

  // Rielabora tutti gli slot attivi
  for (const [slotType, list] of Object.entries(files)) {
    if (!list) continue;
    for (const file of list) {
      try {
        let parsed = {};
        const isPDF = file.name.toLowerCase().endsWith('.pdf');
        const isXML = /\.(xml)$/i.test(file.name);

        if (isPDF) {
          const text = await pdfToText(file);
          if      (slotType === 'f24')     parsed = parseF24(text);
          else if (slotType === 'rpf')     parsed = parseRPF(text);
          else if (slotType === 'redditi') parsed = parseRedditi(text);
        } else if (isXML) {
          const text = await file.text();
          if (slotType === 'fic') parsed = parseFIC(text);
        }

        // ── MERGE INTELLIGENTE ────────────────────────────────────
        const ACCUMULATE = ['totaleVersato','acc0900','acc1790','acc1791','acc1792','accInps','nFatture','fattureCon'];
        for (const [key, val] of Object.entries(parsed)) {
          if (val == null || val === false) continue;
          
          if (key === 'fatt') {
            // Se proviene da RPF/redditi (dichiarazione anno precedente), va in prevYear e NON nel fatturato corrente
            if (slotType === 'rpf' || slotType === 'redditi') {
              prevYear.fatt = val;
            } else {
              // Da FIC (anno corrente), si imposta/accumula in extracted.fatt
              extracted.fatt = (extracted.fatt || 0) + val;
            }
          } else if (ACCUMULATE.includes(key)) {
            if (val === 0) continue;
            extracted[key] = (extracted[key] || 0) + val;
          } else if (key === 'isRicevuta' || key === 'isGrafico') {
            extracted[key] = extracted[key] || val;
          } else {
            if (val !== 0 || extracted[key] == null) extracted[key] = val;
          }
        }
      } catch(e) {
        logErr(`Errore lettura ${file.name}: ${e.message}`);
      }
    }
  }

  updateExtractedPills();
  prefillFields();
}


/* ── UI E PREFILL ──────────────────────────────────────────── */
const PILL_DEFS = [
  { key:'fatt',             label:'Fatturato',           src:'RPF/FIC' },
  { key:'inpsDed',          label:'INPS deducibili',     src:'RPF/F24' },
  { key:'accImp',           label:'Acconti imp. sost.',  src:'RPF'     },
  { key:'credito',          label:'Credito residuo',     src:'RPF'     },
  { key:'acc0900',          label:'Versato INPS (0900)', src:'F24'     },
  { key:'acc1790',          label:'Versato imp. (1790)', src:'F24'     },
  { key:'imposta',          label:'Imp.sost. (LM39)',    src:'RPF'     },
  { key:'redLordo',         label:'Reddito lordo',       src:'RPF'     },
  { key:'inpsDov',          label:'INPS dovuto (RR)',    src:'RPF'     },
  { key:'nFatture',         label:'N. fatture emesse',   src:'FIC'     },
  { key:'fattureCon',       label:'Fatture con bollo',   src:'FIC'     },
  { key:'coeff',            label:'Coeff. redditività',  src:'RPF', fmt: v => v+'%' },
  { key:'aliqImposta',      label:'Aliquota imposta',    src:'RPF', fmt: v => v+'%' },
  { key:'annoDichiarazione',label:'Anno d\'imposta',     src:'RPF', fmt: v => String(v) },
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
    return `<div class="ex-pill">
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

function impostaAliquota(val) {
  setField('i-aliq', 'aliq', val);
  const elWarn = document.getElementById('aliq-warning');
  if (elWarn) elWarn.style.display = 'none';
  logOk(`Aliquota al ${val}% applicata con successo.`);
}
window.impostaAliquota = impostaAliquota;

/* ── PREFILL COMPLETO ─────────────────────────────────────────*/
function prefillFields() {

  // Fatturato
  if (extracted.fatt)       setField('i-fatt',     'fatt',     extracted.fatt);

  // Marche da bollo (priorità: discriminato > totale)
  const nBolli = extracted.fattureCon || extracted.nFatture || null;
  if (nBolli)               setField('i-bolli',    'bolli',    nBolli);

  // Coefficiente redditività
  if (extracted.coeff)      setField('i-coeff',    'coeff',    extracted.coeff);

  // Aliquota imposta sostitutiva
  const elWarn = document.getElementById('aliq-warning');
  if (elWarn) elWarn.style.display = 'none';

  if (extracted.aliqImposta) {
    if (extracted.aliqImposta === 5) {
      if (elWarn) {
        elWarn.innerHTML = `Rilevata aliquota al 5% nel 2024. Sei ancora nel quinquennio agevolato? <a href="#" onclick="impostaAliquota(5); return false;">Applica aliquota al 5%</a>`;
        elWarn.style.display = 'block';
      }
      logInfo(`Aliquota al 5% rilevata nella dichiarazione precedente. Per prudenza il calcolatore mantiene il 15% (scadenza quinquennio). Se hai ancora diritto all'aliquota agevolata, clicca sul link sotto il campo.`);
    } else {
      setField('i-aliq', 'aliq', extracted.aliqImposta);
    }
  }

  // Mesi al F24 di giugno (auto)
  const elMesi = document.getElementById('i-mesi');
  if (elMesi && !elMesi.classList.contains('auto-filled')) {
    const mesiAuto = calcolaMesiAGiugno();
    elMesi.value = mesiAuto;
    elMesi.classList.add('auto-filled');
    setSrc('mesi', true);
    logInfo(`Mesi al F24 di giugno (auto): ${mesiAuto}`);
  }

  // INPS deducibili + Acconti
  const hasCodici   = (extracted.acc0900||0) + (extracted.acc1790||0) + (extracted.acc1791||0) > 0;
  const hasRicevuta = extracted.isRicevuta && extracted.totaleVersato > 0;

  console.log('[DEBUG prefill] acc0900:', extracted.acc0900, 
              'accInps:', extracted.accInps, 
              'hasCodici:', hasCodici,
              'i-acc-inps value:', document.getElementById('i-acc-inps')?.value);

  if (hasCodici) {
    // F24 digitale con codici tributo — massima precisione
    const inpsDed = extracted.acc0900 > 0 ? extracted.acc0900 : (extracted.inpsDed || null);
    if (inpsDed)            setField('i-inps-ded', 'inpsDed', inpsDed);
    const accImpF24 = (extracted.acc1790||0) + (extracted.acc1791||0);
    const accImp    = extracted.accImp || (accImpF24 > 0 ? accImpF24 : null);
    if (accImp)             setField('i-acc-imp',  'accImp',  accImp);
    const accInps = extracted.accInps > 0 
      ? extracted.accInps 
      : (extracted.acc0900 > 0 ? extracted.acc0900 : null);
    if (accInps)            setField('i-acc-inps', 'accInps', accInps);

  } else if (hasRicevuta || extracted.isGrafico) {
    const totF24  = extracted.totaleVersato || 0;
    const accImp  = extracted.accImp || 0;
    const credito = (extracted.credito != null) ? extracted.credito : 0;
    const impCash = Math.max(0, accImp - credito);
    const inpsDed = Math.max(0, totF24 - impCash);
    
    if (inpsDed > 0) {
      setField('i-inps-ded', 'inpsDed', inpsDed);
      logInfo(`INPS deducibili calcolati da ricevute F24: € ${fmtEur(inpsDed)}`);
      
      const inpsSaldo = extracted.inpsSaldo || 0;
      const accInps   = Math.max(0, inpsDed - inpsSaldo);
      if (accInps > 0) {
        setField('i-acc-inps', 'accInps', accInps);
        logInfo(`Acconti INPS calcolati da ricevute F24: € ${fmtEur(accInps)}`);
      }
    } else {
      if (extracted.inpsDed)  setField('i-inps-ded', 'inpsDed', extracted.inpsDed);
      if (extracted.accInps)  setField('i-acc-inps', 'accInps', extracted.accInps);
    }
    if (extracted.accImp)   setField('i-acc-imp',  'accImp',  extracted.accImp);

  } else {
    // Solo RPF
    if (extracted.inpsDed)  setField('i-inps-ded', 'inpsDed', extracted.inpsDed);
    if (extracted.accImp)   setField('i-acc-imp',  'accImp',  extracted.accImp);
    if (extracted.accInps)  setField('i-acc-inps', 'accInps', extracted.accInps);
  }

  // Credito anno precedente
  const creditoVal = extracted.lm47 != null 
    ? extracted.lm47 
    : (extracted.credito != null ? extracted.credito : null);
  if (creditoVal != null) setField('i-credito', 'credito', creditoVal);

  // Dati anno precedente per il confronto
  if (extracted.redLordo) prevYear.redLordo = extracted.redLordo;
  if (extracted.imposta)  prevYear.imposta  = extracted.imposta;
  if (extracted.inpsDov)  prevYear.inpsDov  = extracted.inpsDov;
  if (prevYear.fatt == null && extracted.fatt) prevYear.fatt = extracted.fatt;

  // Riepilogo
  const campiMonitorati = ['i-fatt','i-bolli','i-coeff','i-aliq','i-inps-ded','i-acc-imp','i-acc-inps','i-credito','i-mesi'];
  const filled = campiMonitorati.filter(id => document.getElementById(id)?.classList.contains('auto-filled')).length;
  if (filled > 0) logOk(`Pre-compilati ${filled}/${campiMonitorati.length} campi. Controlla e poi premi "Calcola".`);
  else            logWarn('Nessun campo pre-compilato — i dati non sono stati riconosciuti. Compila manualmente.');

  // Avvisi campi critici vuoti
  ['i-fatt','i-inps-ded'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('auto-filled') && !el.value)
      logWarn(`Campo "${el.placeholder || id}" non compilato — inserisci manualmente.`);
  });
}