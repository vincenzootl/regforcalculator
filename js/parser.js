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
  fatt:{ icon:'🧾', title:'Fatturato da FattureInCloud', body:'Totale delle fatture emesse nell\'anno, come appare nel riepilogo di FattureInCloud. Non include le marche da bollo, che aggiungiamo separatamente.', example:'Es.: € 25.000 da FattureInCloud + € 60 di bolli (30 fatture) = € 25.060 da dichiarare' },
  bolli:{ icon:'📮', title:'Fatture con marca da bollo', body:'Ogni fattura emessa in esenzione IVA con importo > € 77,47 richiede una marca da bollo virtuale di € 2,00.', example:'30 fatture × € 2 = € 60 da aggiungere al fatturato dichiarato' },
  coeff:{ icon:'📐', title:'Coefficiente di redditività', body:'Nel regime forfettario non si deducono le spese reali. Il tuo codice ATECO determina una percentuale fissa del fatturato.', example:'Comunicazione/marketing (ATECO 731xxx, 741xxx): 78%. Su € 25.000 → reddito lordo € 19.500' },
  aliq:{ icon:'📊', title:'Imposta sostitutiva', body:'Sostituisce IRPEF e addizionali. È al 5% per i primi 5 anni, poi diventa 15%.', example:'Dopo 5 anni: 15% × € 15.000 di reddito netto = € 2.250 di imposta' },
  inpsDed:{ icon:'🔄', title:'Contributi INPS deducibili', body:'Si deduce dal reddito lordo l\'importo dei contributi INPS effettivamente versati nell\'anno solare.', example:'Saldo anno prec. (€ 500) + 1° acconto (€ 1.200) + 2° acconto (€ 1.200) = € 2.900 deducibili' },
  inpsAliq:{ icon:'🏛️', title:'Aliquota INPS Gestione Separata', body:'L\'aliquota 2025 è 26,07% sul reddito lordo forfettario.', example:'26,07% × € 19.500 di reddito lordo = circa € 5.084 di contributi dovuti' },
  accImp:{ icon:'💳', title:'Acconti imposta sostitutiva già versati', body:'Acconti sull\'imposta sostitutiva (codice 1790 + 1791 nei tuoi F24).', example:'1° acconto € 400 + 2° acconto € 400 = € 800 versati durante l\'anno' },
  accInps:{ icon:'💳', title:'Acconti INPS già versati', body:'Totale dei versamenti INPS Gestione Separata effettuati durante l\'anno.', example:'Saldo anno prec. (€ 500) + 1° acc. (€ 1.200) + 2° acc. (€ 1.200) = € 2.900' },
  credito:{ icon:'✅', title:'Credito anno precedente residuo', body:'Se dalla dichiarazione dell\'anno scorso è emerso un credito non ancora compensato.', example:'LM43 = € 66, LM44 = € 66 → credito residuo = € 0' },
  mesi:{ icon:'📅', title:'Mesi al F24 di giugno', body:'Quanti mesi mancano alla scadenza del F24 di giugno.', example:'6 mesi rimanenti e € 6.000 da versare → € 1.000 al mese da mettere da parte' }
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
  if (names.length) {
    uz.classList.add('has-file');
    el.innerHTML = names.map(n =>
      `<span class="file-badge">✓ ${n.length > 22 ? n.slice(0,20)+'…' : n}</span>`
    ).join('');
  }
}

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

/* ── PARSER F24 ──────────────────────────────────────────────── */
function parseF24(text) {
  logInfo('F24: analisi formato PDF...');
  const result = { acc0900: 0, acc1790: 0, acc1791: 0, acc1792: 0, totaleVersato: 0, isRicevuta: false, isGrafico: false };
  const flat = text.replace(/\s+/g, ' ').trim();

  // FORMATO A: Ricevuta - Resa più flessibile per eventuali spazi
  const ricevutaRe = /[Ii]mporto\s+versamento\s*:\s*[Ee]\.?\s*([\d\.\s]+,\s*\d{2})/g;
  let mRic, totRic = 0, nRic = 0;
  while ((mRic = ricevutaRe.exec(flat)) !== null) {
    const strPulita = mRic[1].replace(/\s+/g, '');
    const v = parseIT(strPulita);
    if (v && v > 0 && v < 100000) { totRic += v; nRic++; logOk(`Ricevuta: € ${fmtEur(v)}`); }
  }
  if (nRic > 0) {
    result.isRicevuta = true;
    result.totaleVersato = Math.round(totRic * 100) / 100;
    logInfo(`Trovate ${nRic} ricevuta/e per questo file. Totale: € ${fmtEur(result.totaleVersato)}`);
    return result;
  }

  // FORMATO C: F24 digitale con codici tributo
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

  // FORMATO B: F24 grafico (numeri con spazio: "1.892 06")
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
  const flat = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');

  // Helper intelligente che COMPRIME i numeri spaziati del PDF prima di matcharli
  function getLM(rigo, minVal, maxVal) {
    const labels = [`LM${rigo}`, `LM ${rigo}`, `LM0${rigo}`];
    for (const lbl of labels) {
      const idx = flat.indexOf(lbl);
      if (idx === -1) continue;
      const chunk = flat.slice(idx + lbl.length, idx + lbl.length + 300);
      
      // RIMUOVE GLI SPAZI DAL CHUNK per unire numeri separati come "18 . 144 , 00"
      const compressedChunk = chunk.replace(/\s+/g, '');
      const amounts = compressedChunk.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
      
      const validAmounts = amounts.map(parseIT).filter(v => v >= (minVal || 1) && v <= (maxVal || 999999));
      if (validAmounts.length) return validAmounts[0];
    }
    return null;
  }

  // LM
  if ((result.fatt = getLM(22, 100, 500000))) logOk(`LM22 fatturato = € ${fmtEur(result.fatt)}`);
  if ((result.redLordo = getLM(34, 100, 500000))) logOk(`LM34 reddito lordo = € ${fmtEur(result.redLordo)}`);
  if ((result.inpsDed = getLM(35, 1, 50000))) logOk(`LM35 INPS deducibili = € ${fmtEur(result.inpsDed)}`);
  if ((result.redNetto = getLM(36, 1, 500000))) logOk(`LM36 reddito netto = € ${fmtEur(result.redNetto)}`);
  if ((result.imposta = getLM(39, 1, 50000))) logOk(`LM39 imposta sostitutiva = € ${fmtEur(result.imposta)}`);
  
  result.lm43 = getLM(43, 0.01, 10000);
  result.lm44 = getLM(44, 0.01, 10000);
  if ((result.accImp = getLM(45, 1, 50000))) logOk(`LM45 acconti imp.sostitutiva = € ${fmtEur(result.accImp)}`);

  if (result.lm43 != null && result.lm44 != null) {
    result.credito = Math.max(0, result.lm43 - result.lm44);
    logOk(`Credito residuo (LM43 - LM44) = € ${fmtEur(result.credito)}`);
  } else if (result.lm43 != null) {
    result.credito = result.lm43;
  }

  // ALGORITMO PREDITTIVO QUADRO RR (INPS)
  const rrIdx = flat.indexOf('RR5');
  if (rrIdx !== -1) {
    const chunk = flat.slice(rrIdx, rrIdx + 800);
    const compressed = chunk.replace(/\s+/g, '');
    const amounts = compressed.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
    const vals = amounts.map(parseIT).filter(v => v >= 10);
    
    if (vals.length > 0) {
      // 1. Trova imponibile (il numero nettamente più grande del quadro)
      const imponibile = Math.max(...vals);
      // 2. Calcola a quanto ammonta l'aliquota di quell'imponibile
      const target = imponibile * 0.2607;
      // 3. Trova il numero estratto che si avvicina di più al target (tolleranza 5%)
      const dovuto = vals.find(v => Math.abs(v - target) / target < 0.05);

      if (imponibile > 100) {
        result.inpsImponibile = imponibile;
        logOk(`RR5 Imponibile INPS calcolato = € ${fmtEur(imponibile)}`);
      }
      if (dovuto) {
        result.inpsDov = dovuto;
        logOk(`RR6 INPS dovuto calcolato = € ${fmtEur(dovuto)}`);
      }
    }
  }

  const found = Object.keys(result).length;
  if (found === 0) logWarn('RPF: nessun dato trovato — assicurati che il PDF non sia scansionato come immagine.');
  else logOk(`RPF: estratti ${found} campi.`);

  return result;
}

function parseRedditi(text) { return parseRPF(text); }

/* ── PARSER FattureInCloud ───────────────── */
function parseFIC(text) {
  logInfo('FattureInCloud: estrazione dati in corso...');
  const result = { fatt: 0, nFatture: 0 };

  const totAnnuoIdx = text.indexOf('Totale Annuo');
  if (totAnnuoIdx !== -1) {
    const chunk = text.slice(totAnnuoIdx, totAnnuoIdx + 600);
    const numMatches = chunk.match(/>([\d]+(?:\.[\d]+)?)</g) || [];
    for (const m of numMatches) {
      const v = parseFloat(m.replace(/[><]/g, ''));
      if (v >= 1000 && v < 500000) {
        result.fatt = Math.round(v * 100) / 100;
        logOk(`Totale Annuo trovato = € ${fmtEur(result.fatt)}`);
        break;
      }
    }
  }

  const sezioniEmesse = [...text.matchAll(/Fatture emesse([\s\S]*?)(?:Fatture ricevute|Tot\.\s*[1-4])/g)];
  let nFattureEmesse = 0;
  sezioniEmesse.forEach(m => {
    nFattureEmesse += (m[1].match(/T00:00:00/g) || []).length;
  });
  if (nFattureEmesse === 0) {
    nFattureEmesse = (text.match(/T00:00:00/g) || []).length;
  }
  result.nFatture = nFattureEmesse;
  if (result.nFatture > 0) logOk(`Fatture emesse contate: ${result.nFatture}`);

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
      const isXML = /\.(xml|xls|xlsx|csv)$/i.test(file.name);

      if (isPDF) {
        const text = await pdfToText(file);
        if (type === 'f24') parsed = parseF24(text);
        else if (type === 'rpf') parsed = parseRPF(text);
        else if (type === 'redditi') parsed = parseRedditi(text);
      } else if (isXML) {
        const text = await file.text();
        if (type === 'fic') parsed = parseFIC(text);
      }

      // MERGE INTELLIGENTE PER NON SOVRASCRIVERE O AZZERARE DATI
      for (const [key, val] of Object.entries(parsed)) {
        if (val == null || val === 0 || val === false) continue; // Ignora gli "0" estratti da file irrilevanti

        if (['totaleVersato', 'acc0900', 'acc1790', 'acc1791', 'acc1792', 'fatt', 'nFatture'].includes(key)) {
          // Accumula: F241 + F242, o Ricevuta1 + Ricevuta2
          extracted[key] = (extracted[key] || 0) + val;
        } else if (key === 'isRicevuta' || key === 'isGrafico') {
          extracted[key] = extracted[key] || val;
        } else {
          // Assegna e basta per campi della dichiarazione
          extracted[key] = val;
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
  if (extracted.fatt) setField('i-fatt', 'fatt', extracted.fatt);
  if (extracted.nFatture) setField('i-bolli', 'bolli', extracted.nFatture);

  const hasCodici = (extracted.acc0900 || 0) + (extracted.acc1790 || 0) + (extracted.acc1791 || 0) > 0;
  const hasRicevuta = extracted.isRicevuta && extracted.totaleVersato > 0;

  if (hasCodici) {
    const inpsDed = extracted.acc0900 > 0 ? extracted.acc0900 : (extracted.inpsDed || null);
    if (inpsDed) setField('i-inps-ded', 'inpsDed', inpsDed);

    const accImpF24 = (extracted.acc1790 || 0) + (extracted.acc1791 || 0);
    const accImp = extracted.accImp || (accImpF24 > 0 ? accImpF24 : null);
    if (accImp) setField('i-acc-imp', 'accImp', accImp);

    if (extracted.acc0900 > 0) setField('i-acc-inps', 'accInps', extracted.acc0900);

  } else if (hasRicevuta || extracted.isGrafico) {
    if (extracted.inpsDed) setField('i-inps-ded', 'inpsDed', extracted.inpsDed);
    if (extracted.accImp)  setField('i-acc-imp',  'accImp',  extracted.accImp);
    
    const totF24 = extracted.totaleVersato || 0;
    const accImpNota = extracted.accImp || 0;
    const accInpsStima = Math.max(0, totF24 - accImpNota);
    if (accInpsStima > 0 && !extracted.inpsDed) {
      setField('i-acc-inps', 'accInps', accInpsStima);
      logWarn(`Acconti INPS stimati da F24 totale: € ${fmtEur(accInpsStima)}`);
    }
  } else {
    if (extracted.inpsDed) setField('i-inps-ded', 'inpsDed', extracted.inpsDed);
    if (extracted.accImp)  setField('i-acc-imp',  'accImp',  extracted.accImp);
  }

  if (extracted.credito != null) setField('i-credito', 'credito', extracted.credito);

  if (extracted.redLordo) prevYear.redLordo = extracted.redLordo;
  if (extracted.imposta)  prevYear.imposta  = extracted.imposta;
  if (extracted.inpsDov)  prevYear.inpsDov  = extracted.inpsDov;
  if (extracted.fatt)     prevYear.fatt     = extracted.fatt;

  // Conta campi compilati e aggiorna il log
  const filled = ['i-fatt','i-bolli','i-inps-ded','i-acc-imp','i-acc-inps','i-credito']
    .filter(id => document.getElementById(id)?.classList.contains('auto-filled')).length;

  if (filled > 0) logOk(`Pre-compilati ${filled} campi. Controlla e correggi se necessario, poi premi "Calcola".`);
  else logWarn('Nessun campo pre-compilato — i dati nei PDF potrebbero non essere stati riconosciuti. Compila manualmente.');
}