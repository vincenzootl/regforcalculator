'use strict';

/* ── PDF.js worker ─────────────────────────────────────────── */
let pdfAvailable = false;
if (typeof pdfjsLib !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    pdfAvailable = true;
  } catch (e) {
    console.error('PDF.js worker init failed:', e);
  }
}

/* ── STATE ─────────────────────────────────────────────────── */
const extracted = {};
const files = {};
let S = {};
let chartCfr = null, chartAcc = null;
let prevYear = {};
const fileSignatures = new Set(); // dedup: "name|size|lastModified"

/* ── ONBOARDING STATE ──────────────────────────────────────────── */
const onbState = { anni: null, ateco: null, coeff: 78, cassa: null };

const ATECO_MAP = {
  '78':     { coeff: 78,  label: 'Professionisti / creativi' },
  '86':     { coeff: 78,  label: 'Professioni sanitarie'     },
  '67':     { coeff: 62,  label: 'Agenti / rappresentanti'   },
  '40':     { coeff: 40,  label: 'Commercio'                 },
  '86c':    { coeff: 86,  label: 'Artigiani / costruzioni'   },
  '54':     { coeff: 40,  label: 'Ristorazione / alloggio'   },
  'custom': { coeff: 78,  label: 'Personalizzato'            },
};

const CASSA_ALERTS = {
  artig: `⛔ Calcolo INPS non supportato per Artigiani/Commercianti. Questa 
          gestione ha un meccanismo contributivo diverso (minimale + eccedenza) 
          che il calcolatore non gestisce. I risultati INPS NON saranno calcolati 
          — verrà mostrato solo il calcolo dell'imposta sostitutiva.`,
  cassa: `⛔ Calcolo INPS non supportato per le Casse professionali (Inarcassa, 
          Cassa Forense, ecc.). Hanno aliquote e regole proprie. I risultati INPS 
          NON saranno calcolati — verrà mostrato solo il calcolo dell'imposta sostitutiva.`,
};

function selectOnb(group, value, btn) {
  // Deseleziona tutti nel gruppo
  document.querySelectorAll(`#onb-${group} .onb-opt`)
    .forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  onbState[group] = value;

  // Gestisci input custom coefficiente
  if (group === 'ateco') {
    const customDiv = document.getElementById('onb-coeff-custom');
    if (customDiv) customDiv.style.display = value === 'custom' ? 'block' : 'none';
    if (value !== 'custom') {
      onbState.coeff = ATECO_MAP[value]?.coeff ?? 78;
    }
  }

  // Mostra alert per casse non supportate (bloccante per INPS)
  if (group === 'cassa') {
    const alertEl = document.getElementById('onb-alert-cassa');
    if (alertEl) {
      const cassaInfo = REGOLE.cassaPrevidenziale[value];
      if (cassaInfo && !cassaInfo.supportato && CASSA_ALERTS[value]) {
        alertEl.innerHTML = CASSA_ALERTS[value];
        alertEl.style.display = 'block';
        alertEl.classList.add('blocking');
      } else if (CASSA_ALERTS[value]) {
        alertEl.innerHTML = '⚠️ ' + CASSA_ALERTS[value];
        alertEl.style.display = 'block';
        alertEl.classList.remove('blocking');
      } else {
        alertEl.style.display = 'none';
        alertEl.classList.remove('blocking');
      }
    }
  }

  // Avviso fine quinquennio + requisiti startup
  if (group === 'anni') {
    const alertEl = document.getElementById('onb-alert-anni');
    if (alertEl) {
      const currYear = new Date().getFullYear();
      if (value === '1-5') {
        alertEl.innerHTML = `✓ Aliquota agevolata 5% — ricorda che scade al termine del quinto 
           anno. Se nel ${currYear} concludi il quinquennio, dal prossimo anno 
           passerai al 15%.
           <br><br>
           <strong>Attenzione:</strong> l'aliquota al 5% spetta solo se la tua attività 
           è realmente nuova e non è la prosecuzione di un'attività precedente 
           (dipendente o autonoma nello stesso settore). Questo è un requisito 
           di legge (art. 1, comma 65, L. 190/2014), non una scelta.`;
      } else {
        alertEl.innerHTML = `✓ Aliquota ordinaria 15% applicata.`;
      }
      alertEl.style.display = 'block';
    }
  }

  updateOnbRecap();
  checkOnbComplete();
}

function onbCoeffChange(val) {
  const parsed = parseFloat(val);
  const inputEl = document.getElementById('onb-coeff-val');
  const errorEl = document.getElementById('onb-coeff-error');
  const isValid = !isNaN(parsed) && parsed >= 1 && parsed <= 100;

  if (isValid) {
    onbState.coeff = parsed;
    onbState._coeffValid = true;
    if (inputEl) inputEl.classList.remove('input-error');
    if (errorEl) errorEl.style.display = 'none';
  } else {
    onbState._coeffValid = false;
    if (inputEl) inputEl.classList.add('input-error');
    if (errorEl) {
      errorEl.textContent = 'Coefficiente non valido (1–100)';
      errorEl.style.display = 'block';
    }
  }

  updateOnbRecap();
  checkOnbComplete();
}

function updateOnbRecap() {
  const { anni, ateco, coeff, cassa } = onbState;
  if (!anni && !ateco && !cassa) return;

  const aliq    = anni === '1-5' ? 5 : 15;
  const coeffVal = ateco ? (ATECO_MAP[ateco]?.coeff ?? coeff) : coeff;
  const cassaLabel = {
    gs:    'Gestione Separata INPS (26,07%)',
    artig: 'Artigiani/Commercianti INPS',
    cassa: 'Cassa professionale',
  }[cassa] || '—';

  const recap = document.getElementById('onb-recap');
  const grid  = document.getElementById('onb-recap-grid');
  if (recap) recap.style.display = 'block';

  if (grid) {
    grid.innerHTML = `
      <div class="onb-recap-item">
        <span class="onb-recap-lbl">Aliquota imposta</span>
        <span class="onb-recap-val">${aliq}%</span>
      </div>
      <div class="onb-recap-item">
        <span class="onb-recap-lbl">Coefficiente</span>
        <span class="onb-recap-val">${coeffVal}%</span>
      </div>
      <div class="onb-recap-item">
        <span class="onb-recap-lbl">Previdenza</span>
        <span class="onb-recap-val" style="font-size:.78rem">${cassaLabel}</span>
      </div>`;
  }
}

function checkOnbComplete() {
  const { anni, ateco, cassa } = onbState;
  const btn = document.getElementById('onb-next-btn');
  if (!btn) return;
  // Se custom e coefficiente non valido → blocca
  const coeffOk = ateco !== 'custom' || onbState._coeffValid !== false;
  const complete = anni && ateco && cassa && coeffOk;
  btn.disabled = !complete;
  btn.style.opacity = complete ? '1' : '.4';
  btn.style.cursor  = complete ? 'pointer' : 'not-allowed';
}

/* ── APPLY ONBOARDING → FIELDS (centralizzato) ──────────────── */
function applyOnboardingToFields() {
  if (!onbState.anni || !onbState.ateco || !onbState.cassa) return;

  const aliq  = onbState.anni === '1-5' ? 5 : 15;
  const coeff = onbState.ateco !== 'custom'
    ? (ATECO_MAP[onbState.ateco]?.coeff ?? 78)
    : onbState.coeff;

  const elAliq  = document.getElementById('i-aliq');
  const elCoeff = document.getElementById('i-coeff');
  if (elAliq)  { elAliq.value  = aliq;  elAliq.classList.add('auto-filled');  setSrc('aliq',  true); }
  if (elCoeff) { elCoeff.value = coeff; elCoeff.classList.add('auto-filled'); setSrc('coeff', true); }

  // Flag cassa per il calcolo (letto da calcolo.js)
  window.onbCassa = onbState.cassa;

  // Disabilita campi INPS se cassa non supportata
  const cassaInfo = REGOLE.cassaPrevidenziale[onbState.cassa];
  const inpsDisabled = cassaInfo && !cassaInfo.supportato;
  const inpsFields = ['i-inps-ded', 'i-inps-aliq', 'i-acc-inps'];
  inpsFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = inpsDisabled;
      if (inpsDisabled) {
        el.value = '';
        el.placeholder = 'N/A';
        el.classList.add('auto-filled');
      }
    }
  });
}

function completeOnboarding() {
  if (!onbState.anni || !onbState.ateco || !onbState.cassa) return;

  applyOnboardingToFields();

  // Avviso se cassa non supportata
  const cassaInfo = REGOLE.cassaPrevidenziale[onbState.cassa];
  if (cassaInfo && !cassaInfo.supportato) {
    logWarn(`Cassa previdenziale "${cassaInfo.label}" — i contributi INPS NON saranno calcolati. Solo l'imposta sostitutiva verrà mostrata.`);
  }

  goStep(1); // Vai allo step Documenti
}

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
  inpsAliq:{ icon:'🏛️', title:'Aliquota INPS Gestione Separata', body:'L\'aliquota è 26,07% sul reddito lordo forfettario (Circolare INPS 27/2025). Aggiornare se la circolare dell\'anno corrente modifica la percentuale.', example:'26,07% × € 19.500 di reddito lordo = circa € 5.084 di contributi dovuti' },
  accImp:  { icon:'💳', title:'Acconti imposta sostitutiva già versati', body:'Acconti sull\'imposta sostitutiva (codice 1790 + 1791 nei tuoi F24).', example:'1° acconto € 400 + 2° acconto € 400 = € 800 versati durante l\'anno' },
  accInps: {
    icon:'💳',
    title:'Acconti INPS già versati (solo anno dichiarato)',
    body:'Inserire SOLO i versamenti cod.0900 riferiti all\'anno che si sta dichiarando ' +
         '(periodo = anno corrente). Il saldo dell\'anno precedente (es. saldo 2024 versato a giugno 2025) ' +
         'NON va qui — va nel campo "INPS deducibili". ' +
         'Se hai caricato i PDF F24, questo campo è già compilato correttamente.',
    example:'Esempio per dichiarazione 2025: ' +
            '1° acconto INPS 2025 (giugno 2025): € 1.892 + ' +
            '2° acconto INPS 2025 (novembre 2025): € 1.892 = € 3.784. ' +
            'NON includere il saldo 2024 (€ 682) — quello è già in "INPS deducibili".'
  },
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
  // Se si sta uscendo dallo step 0 (profilo), applica le impostazioni ai campi
  if (currentStep === 0 && n !== 0) {
    applyOnboardingToFields();
  }
  if (n === 2 && Object.keys(files).length === 0) {
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
function skipDocs() { goStep(2); }

/* ── RESET EXTRACTION STATE ──────────────────────────────────── */
function resetExtractionState() {
  for (const k of Object.keys(extracted)) delete extracted[k];
  for (const k of Object.keys(prevYear)) delete prevYear[k];
  fileSignatures.clear();
  for (const k of Object.keys(files)) delete files[k];

  // Reset badge visivi
  document.querySelectorAll('.upload-zone').forEach(uz => {
    uz.classList.remove('has-file');
  });
  ['f24-badge', 'rpf-badge', 'fic-badge'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  // Reset pills e log
  const pills = document.getElementById('extracted-pills');
  if (pills) { pills.style.display = 'none'; pills.innerHTML = ''; }
  const logEl = document.getElementById('extract-log');
  if (logEl) { logEl.innerHTML = ''; logEl.classList.remove('visible'); }

  // Reset warning anno
  const yearWarn = document.getElementById('fic-year-warning');
  if (yearWarn) yearWarn.style.display = 'none';

  logOk('Stato di estrazione azzerato. Puoi ricaricare i documenti.');
}
window.resetExtractionState = resetExtractionState;

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
  if (!pdfAvailable || typeof pdfjsLib === 'undefined') {
    throw new Error('PDF_UNAVAILABLE');
  }
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

/**
 * parseIT — parsing numerico robusto per formati IT e anomali.
 * Rileva il separatore decimale dall'ultimo simbolo ',' o '.'.
 * Gestisce: "1.892,06"→1892.06, "30.396"→30396, "682,00"→682, "2.819,06"→2819.06
 */
function parseIT(s) {
  if (!s) return null;
  const str = String(s).trim();
  if (!str) return null;

  const lastComma = str.lastIndexOf(',');
  const lastDot   = str.lastIndexOf('.');
  let clean;

  if (lastComma > lastDot) {
    // Formato IT: 1.892,06 → rimuovi punti migliaia, virgola → punto
    clean = str.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // Potrebbe essere formato EN (1,892.06) o intero IT con migliaia (30.396)
    // Se ha esattamente 3 cifre dopo l'ultimo punto e nessun'altra parte decimale,
    // è un separatore di migliaia
    const afterDot = str.slice(lastDot + 1);
    if (/^\d{3}$/.test(afterDot) && !/\..*\./.test(str.replace(/,/g, ''))) {
      // Es: 30.396 → 30396, ma NON 1.892.06
      clean = str.replace(/\./g, '').replace(/,/g, '');
    } else {
      // Formato EN con punto decimale: 1,892.06
      clean = str.replace(/,/g, '');
    }
  } else {
    // Nessun separatore o entrambi assenti
    clean = str.replace(/,/g, '');
  }

  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

/**
 * sanitizeValue — scarta NaN, negativi e outlier impossibili.
 * Restituisce null se il valore non è valido.
 */
function sanitizeValue(val, fieldName) {
  if (val == null || isNaN(val)) return null;
  if (val < 0) { logWarn(`${fieldName}: valore negativo (${val}) scartato.`); return null; }
  if (fieldName === 'coeff' && val > 100) { logWarn(`${fieldName}: valore ${val} > 100 scartato.`); return null; }
  if (val > 1000000) { logWarn(`${fieldName}: valore ${val} troppo alto, scartato.`); return null; }
  return val;
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
  const result = { acc0900: 0, acc1790: 0, acc1791: 0, acc1792: 0, accInps: 0, accInpsSaldoPrec: 0, totaleVersato: 0, isRicevuta: false, isGrafico: false };
  const pagesText = text.split('\n').filter(p => p.trim().length > 0);

  // ── Sezione Ricevute Entratel (formato "Comunicazione di avvenuto ricevimento") ──
  // IMPORTANTE: rilevare SOLO ricevute Entratel (header specifico), NON le deleghe F24.
  // La ricevuta contiene solo l'importo totale, NON i codici tributo dettagliati.
  const flatGlobal = text.replace(/\s+/g,' ').trim();
  const isEntratelRicevuta = /AVVENUTO\s+RICEVIMENTO|TELEMATICO\s+ENTRATEL|COMUNICAZIONE\s+DI\s+AVVENUTO/i.test(flatGlobal);
  if (isEntratelRicevuta) {
    const ricevutaRe = /[Ii]mporto\s+versamento\s*:\s*[Ee€\.\s]+\s*([\d\.\s]+,\s*\d{2})/g;
    let mRic, totRic = 0, nRic = 0;
    while ((mRic = ricevutaRe.exec(flatGlobal)) !== null) {
      const v = parseIT(mRic[1].replace(/\s+/g, ''));
      if (v && v > 0 && v < 100000) { totRic += v; nRic++; logOk(`Ricevuta Entratel: € ${fmtEur(v)}`); }
    }
    if (nRic > 0) {
      result.isRicevuta    = true;
      result.totaleVersato = Math.round(totRic * 100) / 100;
      logWarn(`Rilevata ricevuta Entratel (totale versato: € ${fmtEur(result.totaleVersato)}). ` +
              `Per il calcolo preciso carica la DELEGA F24 originale (il PDF con i codici tributo), ` +
              `non la ricevuta di pagamento. Puoi trovare la delega nel cassetto fiscale AdE → sezione F24.`);
      return result;
    }
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
      if (r.code === '0900') {
        result.acc0900 += r.amt;
        trovati = true;
        logOk(`Trovato Cod.${r.code} su pag.${idx+1}: € ${fmtEur(r.amt)}`);

        const years = r.key.match(/\b20\d{2}\b/g) || [];
        const refYear = years.length > 0 ? parseInt(years[years.length - 1], 10) : 0;

        if (refYear === maxYear) {
          // Acconto anno corrente → serve per calcolare il saldo INPS da versare
          result.accInps += r.amt;
          logInfo(`Cod.0900 anno ${refYear} (acconto corrente): € ${fmtEur(r.amt)}`);
        } else if (refYear === maxYear - 1) {
          // Saldo anno precedente → fa parte dell'INPS deducibile ma non degli acconti
          result.accInpsSaldoPrec = (result.accInpsSaldoPrec || 0) + r.amt;
          logInfo(`Cod.0900 anno ${refYear} (saldo anno prec.): € ${fmtEur(r.amt)}`);
        }
      } else {
        const resKey = `acc${r.code}`;
        if (resKey in result) {
          result[resKey] += r.amt;
          logOk(`Trovato Cod.${r.code} su pag.${idx+1}: € ${fmtEur(r.amt)}`);
          trovati = true;
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
    result.accInpsSaldoPrec = Math.round((result.accInpsSaldoPrec || 0) * 100) / 100;

    result.totaleVersato = Math.round((result.acc0900 + result.acc1790 + result.acc1791 + result.acc1792) * 100) / 100;
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
        // totali[0] = LM34 reddito lordo (fatturato × coeff), NON il fatturato (LM22)
        // LM22 (fatturato) non appare direttamente nei totali finali del quadro LM
        result.redLordo = totali[0];
        result.inpsDed  = totali[1];
        result.redNetto = totali[3];
        result.imposta  = totali[5];

        logOk(`LM34 reddito lordo = € ${fmtEur(result.redLordo)}`);
        logOk(`LM35 INPS deducibili = € ${fmtEur(result.inpsDed)}`);
        logOk(`LM36 reddito netto = € ${fmtEur(result.redNetto)}`);
        logOk(`LM39 imposta sostitutiva = € ${fmtEur(result.imposta)}`);
      }

      // Estrai il coefficiente di redditività dell'attività principale
      // Validato contro REGOLE.coefficientiLegali per scartare valori spuri (es. mesi=12)
      for (const aMatch of atecoMatches) {
        const localAfter = flatLM.slice(aMatch.index + 6, aMatch.index + 100);
        const coeffM = localAfter.match(/\b(\d{2})\b/);
        if (coeffM) {
          const coeffVal = parseInt(coeffM[1], 10);
          if (REGOLE.coefficientiLegali.has(coeffVal)) {
            result.coeff = coeffVal;
            logOk(`Coefficiente redditività (da dati ATECO) = ${result.coeff}%`);
            break;
          } else {
            logWarn(`Coefficiente RPF ${coeffVal} non è un coefficiente legale — ignorato.`);
          }
        }
      }

      // Deriva il fatturato (LM22) da redLordo / coeff se entrambi disponibili.
      // LM22 non appare nei totali finali — si ricava inverso: LM22 = LM34 / (coeff/100)
      if (result.redLordo && result.coeff) {
        result.fatt = Math.round(result.redLordo / (result.coeff / 100) * 100) / 100;
        logOk(`LM22 fatturato (derivato LM34/coeff) = € ${fmtEur(result.fatt)}`);
      }
    }

    // Aliquota calcolata con tolleranza ±1 punto
    if (result.redNetto && result.imposta) {
      const ratio = (result.imposta / result.redNetto) * 100;
      if (ratio >= 4 && ratio <= 6) {
        result.aliqImposta = 5;
        logOk(`Aliquota imposta = 5% (rilevata ${ratio.toFixed(1)}%)`);
      } else if (ratio >= 14 && ratio <= 16) {
        result.aliqImposta = 15;
        logOk(`Aliquota imposta = 15% (rilevata ${ratio.toFixed(1)}%)`);
      } else {
        logWarn(`Aliquota inferita ${ratio.toFixed(1)}% fuori banda — non assegnata.`);
      }
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
      logOk(`LM47 eccedenza da riportare = € ${fmtEur(result.lm47)}`);
    }
  }

  // LM47 = eccedenza imposta sostitutiva da riportare agli anni successivi.
  // È il credito residuo reale (più preciso di LM43−LM44 che misura solo quanto compensato in F24).
  if (result.lm47 != null && result.lm47 > 0) {
    result.credito = result.lm47;
    logOk(`Credito residuo anno prec. (LM47) = € ${fmtEur(result.credito)}`);
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
//
// Struttura reale verificata su file "riepilogo economico.xml" (FattureInCloud, 2025):
//
//  Worksheet "Contabilità" — colonne per riga fattura emessa:
//    Col1: ss:Type="Number"   → # fattura (1, 2, 3...)     ← PRIMO Number (NON imponibile!)
//    Col2: ss:Type="DateTime" → data fattura
//    Col3: ss:Type="String"   → cliente
//    Col4: ss:Type="String"   → P.IVA
//    Col5: ss:Type="String"   → CF
//    Col6: ss:Type="Number"   → Imponibile                 ← SECONDO Number = ciò che serve
//    Col7...: IVA, ritenute, rivalsa, cassa, ...
//
//  Riga "Totale Annuo" (riga 1649 del file 2025):
//    Col1: "Totale Annuo"  Col2: 30396 (imponibile emesse, PRIMO Number della riga)
//    Col3: 2482.64 (IVA ricevute × detraibilità)
//    Col4: 27913.36 (netto contabile post-ammortamenti/deduzioni)
//
//  Stringa periodo: "Periodo 01/01/2025 - 31/12/2025"
//
function parseFIC(text) {
  logInfo('FattureInCloud: estrazione dati XML SpreadsheetML...');
  const result = { fatt: 0, nFatture: 0, fattureCon: 0 };
  const annoCorrente = new Date().getFullYear();

  // ── Anno: prima da stringa "Periodo", poi da date fatture ────
  const periodoM = text.match(/Periodo\s+\d{2}\/\d{2}\/(\d{4})/);
  if (periodoM) {
    const a = parseInt(periodoM[1], 10);
    result._annoRilevato = a;
    if (a !== annoCorrente) {
      logWarn(`FIC: documento periodo ${a} — anno corrente è ${annoCorrente}.`);
    } else {
      logOk(`FIC: periodo ${a} ✓`);
    }
  } else {
    // Fallback: rileva anno dalle date fatture
    const dateRe = /ss:Type="DateTime">\s*(\d{4})-/g;
    let dateM;
    const anniRilevati = new Set();
    while ((dateM = dateRe.exec(text)) !== null) {
      anniRilevati.add(parseInt(dateM[1], 10));
    }
    if (anniRilevati.size > 0) {
      const annoMax = Math.max(...anniRilevati);
      result._annoRilevato = annoMax;
      if (annoMax !== annoCorrente) {
        logWarn(`FIC: fatture anno ${annoMax}, anno corrente ${annoCorrente}.`);
      } else {
        logOk(`FIC: anno fatture = ${annoMax} ✓`);
      }
    }
  }

  // ── Fatturato: col2 della riga "Totale Annuo" ─────────────────
  // "Totale Annuo" è una cella stringa; il primo Number della stessa riga = imponibile emesse.
  const totAnnuoIdx = text.indexOf('>Totale Annuo<');
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
      // vals[0] = col2 = imponibile totale fatture emesse (es. 30396)
      // vals[1] = col3 = IVA/costi ricevute (es. 2482.64) — non usare
      if (vals.length > 0 && vals[0] >= 100 && vals[0] < 500000) {
        result.fatt = Math.round(vals[0] * 100) / 100;
        logOk(`Totale Annuo imponibile emesse = € ${fmtEur(result.fatt)}`);
      }
    }
  }

  // ── Fallback fatturato: somma "Totale" mensile sezioni emesse ─
  // Usato solo se "Totale Annuo" non trovato.
  // Nella riga "Totale" delle emesse, il PRIMO Number = imponibile mensile.
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
      // Nella riga Totale delle emesse i primi 5 cells sono empty, poi imponibile
      const numRe2 = /<Data\s+ss:Type="Number">([^<]+)<\/Data>/g;
      let mN, first = true;
      while ((mN = numRe2.exec(rowTxt)) !== null) {
        const v = parseFloat(mN[1]);
        if (first && !isNaN(v) && v > 0) { sum += v; first = false; }
      }
    }
    if (sum >= 100) {
      result.fatt = Math.round(sum * 100) / 100;
      logOk(`Fatturato da totali mensili emesse = € ${fmtEur(result.fatt)}`);
    }
  }

  // ── Conta fatture emesse (via DateTime nelle sezioni emesse) ──
  const emesseSections = text.split(/Fatture emesse/g);
  let nFattureEmesse = 0;
  for (let i = 1; i < emesseSections.length; i++) {
    const block = emesseSections[i].split(/Fatture ricevute|Totale Annuo/)[0];
    nFattureEmesse += (block.match(/ss:Type="DateTime"/g) || []).length;
  }
  if (nFattureEmesse > 0) {
    result.nFatture = nFattureEmesse;
    logOk(`Fatture emesse contate: ${nFattureEmesse}`);
  }

  // ── Conta fatture con bollo (imponibile > € 77,47) ───────────
  //
  // Struttura riga fattura emessa: [#(Number), Data(DateTime), Cliente(String),
  //   PIVA(String), CF(String), Imponibile(Number), IVA(Number), ...]
  //
  // Il PRIMO ss:Type="Number" in ogni riga è il # fattura (1, 2, 3...).
  // Il SECONDO ss:Type="Number" è l'IMPONIBILE — quello da confrontare con 77,47.
  //
  // Bug precedente: si usava il primo Number → # fattura ≤ 41 → sempre < 77.47 → 0 bolli.
  //
  let conBollo = 0;
  let righeAnalizzate = 0;
  for (let i = 1; i < emesseSections.length; i++) {
    const block = emesseSections[i].split(/Fatture ricevute|Totale Annuo/)[0];
    const rowRe = /<Row[^>]*>([\s\S]*?)<\/Row>/g;
    let mRow;
    while ((mRow = rowRe.exec(block)) !== null) {
      const rowContent = mRow[1];
      // Salta righe senza data (header, Totale, righe vuote)
      if (!rowContent.includes('ss:Type="DateTime"')) continue;
      righeAnalizzate++;
      // Estrai TUTTI i Number della riga; il secondo è l'imponibile
      const allNums = [...rowContent.matchAll(/<Data\s+ss:Type="Number">([\d.]+)<\/Data>/g)];
      if (allNums.length >= 2) {
        const imp = parseFloat(allNums[1][1]); // [1] = secondo match = imponibile (col6)
        if (!isNaN(imp) && imp > REGOLE.bolloDaBollo.sogliaEsenzione.toNumber()) {
          conBollo++;
        }
      }
    }
  }

  if (righeAnalizzate > 0) {
    result.fattureCon = conBollo;
    if (conBollo > 0) {
      logOk(`Fatture con marca da bollo (imponibile > € 77,47): ${conBollo} su ${righeAnalizzate}`);
    } else {
      logInfo(`Nessuna fattura con imponibile > € 77,47 — bollo = 0. Verifica se corretto.`);
    }
  } else if (result.nFatture > 0) {
    // Nessuna riga analizzata (struttura diversa): stima conservativa
    result.fattureCon = result.nFatture;
    logWarn(`Bolli: struttura righe non riconosciuta — usato n. fatture (${result.nFatture}) come stima. Verifica manualmente.`);
  }

  if (result.fatt > 0) {
    logInfo('FIC: estrae fatturato e n. fatture. Per INPS/acconti/credito carica i PDF F24 e Redditi.');
  }
  return result;
}


/* ── PROCESS FILES E MERGE ──────────────────────────────────── */
async function processFiles(fileList, type) {
  // ── DEDUP per file (name + size + lastModified) ─────────────
  const newFiles = [];
  for (const file of fileList) {
    const sig = `${file.name}|${file.size}|${file.lastModified}`;
    if (fileSignatures.has(sig)) {
      logWarn(`File "${file.name}" già caricato — ignorato.`);
      continue;
    }
    fileSignatures.add(sig);
    newFiles.push(file);
  }
  if (newFiles.length === 0) return;

  // Aggiunge (non sovrascrive) i file nello slot
  files[type] = (files[type] || []).concat(newFiles);

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
        const isXML = /\.(xml|xls|xlsx|csv)$/i.test(file.name);
        
        if (isPDF) {
          if (!pdfAvailable || typeof pdfjsLib === 'undefined') {
            logErr(`Impossibile leggere "${file.name}": libreria PDF non disponibile. Inserisci i dati manualmente.`);
            continue;
          }
          try {
            const text = await pdfToText(file);
            if      (slotType === 'f24')     parsed = parseF24(text);
            else if (slotType === 'rpf')     parsed = parseRPF(text);
            else if (slotType === 'redditi') parsed = parseRedditi(text);
          } catch (pdfErr) {
            if (pdfErr.message === 'PDF_UNAVAILABLE') {
              logErr(`Impossibile leggere i PDF (libreria non disponibile) — inserisci i dati manualmente.`);
            } else {
              logErr(`Errore lettura PDF "${file.name}": ${pdfErr.message}`);
            }
            continue;
          }
        } else if (isXML) {
          const text = await file.text();
          if (slotType === 'fic') parsed = parseFIC(text);
        }

        // ── ANNO-CONSAPEVOLEZZA FIC ────────────────────────────────
        // Logica:
        //  - anno corrente (es. 2026): auto-fill silenzioso
        //  - anno precedente (es. 2025): auto-fill + info (caso NORMALE: dichiarazione 2025 presentata nel 2026)
        //  - anni più vecchi (< annoCorrente-1): blocca, richiede conferma esplicita
        if (slotType === 'fic' && parsed._annoRilevato) {
          const annoCorrente = new Date().getFullYear();
          const annoPrecedente = annoCorrente - 1;
          const annoFic = parsed._annoRilevato;

          if (annoFic === annoPrecedente) {
            // Caso normale: FIC anno fiscale dichiarato (es. 2025 in 2026) → auto-fill
            logInfo(`FIC anno ${annoFic} — anno fiscale dichiarato (normale per dichiarazione ${annoCorrente}). Dati applicati.`);
          } else if (annoFic !== annoCorrente) {
            // Anno troppo vecchio o futuro → blocca e chiedi conferma
            const yearWarn = document.getElementById('fic-year-warning');
            if (yearWarn) {
              yearWarn.innerHTML = `⚠️ Questo documento è dell'anno <strong>${annoFic}</strong> ` +
                `(anno atteso: ${annoPrecedente} o ${annoCorrente}). ` +
                `<a href="#" onclick="applyFicData(); return false;">Applica comunque</a>`;
              yearWarn.style.display = 'block';
            }
            window._pendingFicData = parsed;
            delete parsed.fatt;
            delete parsed.nFatture;
            delete parsed.fattureCon;
            logWarn(`FIC anno ${annoFic}: dati non applicati — anno inatteso. Clicca "Applica comunque" se è corretto.`);
          }
        }

        // ── MERGE INTELLIGENTE ────────────────────────────────────
        const ACCUMULATE = ['totaleVersato','acc0900','acc1790','acc1791','acc1792','accInps','accInpsSaldoPrec','nFatture','fattureCon'];
        for (const [key, val] of Object.entries(parsed)) {
          if (val == null || val === false) continue;
          if (key.startsWith('_')) continue; // campi interni

          // Sanitize
          if (typeof val === 'number') {
            const sanitized = sanitizeValue(val, key);
            if (sanitized == null) continue;
          }
          
          if (slotType === 'rpf' || slotType === 'redditi') {
            if (key === 'inpsDov')  { prevYear.inpsDov  = val; continue; }
            if (key === 'imposta')  { prevYear.imposta  = val; continue; }
            if (key === 'redLordo') { prevYear.redLordo = val; continue; }
            if (key === 'fatt')     { prevYear.fatt     = val; continue; }
          }

          if (key === 'fatt') {
            if (slotType === 'rpf' || slotType === 'redditi') {
              prevYear.fatt = val;
            } else {
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

/* ── APPLY PENDING FIC DATA (anno diverso, utente conferma) ── */
function applyFicData() {
  if (!window._pendingFicData) return;
  const p = window._pendingFicData;
  if (p.fatt)       extracted.fatt       = (extracted.fatt || 0) + p.fatt;
  if (p.nFatture)   extracted.nFatture   = (extracted.nFatture || 0) + p.nFatture;
  if (p.fattureCon) extracted.fattureCon  = (extracted.fattureCon || 0) + p.fattureCon;
  window._pendingFicData = null;
  const yearWarn = document.getElementById('fic-year-warning');
  if (yearWarn) yearWarn.style.display = 'none';
  logOk(`Dati FIC applicati (anno ${p._annoRilevato}).`);
  updateExtractedPills();
  prefillFields();
}
window.applyFicData = applyFicData;


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
  { key:'accInpsSaldoPrec', label:'Saldo INPS anno prec.', src:'F24'   },
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
  const onbCoeff = document.getElementById('i-coeff')?.classList.contains('auto-filled');
  if (!onbCoeff && extracted.coeff)      setField('i-coeff',    'coeff',    extracted.coeff);

  // Aliquota imposta sostitutiva
  const elWarn = document.getElementById('aliq-warning');
  if (elWarn) elWarn.style.display = 'none';

  const onbAliq  = document.getElementById('i-aliq')?.classList.contains('auto-filled');
  if (!onbAliq && extracted.aliqImposta) {
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

  if (hasCodici) {
    // INPS deducibili = TUTTI i versamenti 0900 dell'anno solare:
    // saldo anno prec. (0900 periodo N-1) + 1° acc + 2° acc (0900 periodo N)
    const inpsDed = extracted.acc0900 > 0 ? extracted.acc0900 : (extracted.inpsDed || null);
    if (inpsDed)            setField('i-inps-ded', 'inpsDed', inpsDed);
    if ((extracted.accInpsSaldoPrec || 0) > 0) {
      logInfo(`Dettaglio inpsDed: saldo anno prec. € ${fmtEur(extracted.accInpsSaldoPrec)} + acconti anno corrente € ${fmtEur(extracted.accInps || 0)}`);
    }
    
    // Acconti imposta sostitutiva = 1790 + 1791
    const accImpF24 = (extracted.acc1790||0) + (extracted.acc1791||0);
    const accImp    = extracted.accImp || (accImpF24 > 0 ? accImpF24 : null);
    if (accImp)             setField('i-acc-imp',  'accImp',  accImp);
    
    // Acconti INPS per calcolo saldo = solo quelli riferiti all'anno fiscale corrente
    // (serve per calcolare: saldoInps = INPSdovuto2024 − accInps2024versati)
    // MA per i-acc-inps usiamo accInps (anno corrente) perché serve per il saldo
    // dell'anno precedente, non per dedurre
    const accInps = extracted.accInps > 0 ? extracted.accInps : null;
    if (accInps)            setField('i-acc-inps', 'accInps', accInps);

  } else if (hasRicevuta || extracted.isGrafico) {
    // ⚠️ RICEVUTA ENTRATEL: contiene solo il totale versato, non i codici tributo.
    // Non è possibile separare INPS da imposta dal solo importo totale.
    // Mostriamo i dati RPF se disponibili, altrimenti chiediamo di caricare la delega F24.
    logWarn('Rilevata solo ricevuta/grafico F24 — impossibile separare INPS da imposta. ' +
            'Carica la DELEGA F24 originale per dati precisi, oppure compila manualmente i campi sottostanti.');

    // Se l'RPF è stato caricato, usiamo i suoi valori (più affidabili)
    if (extracted.inpsDed)  setField('i-inps-ded', 'inpsDed', extracted.inpsDed);
    if (extracted.accImp)   setField('i-acc-imp',  'accImp',  extracted.accImp);
    if (extracted.accInps)  setField('i-acc-inps', 'accInps', extracted.accInps);

  } else {
    // Solo RPF
    if (extracted.inpsDed)  setField('i-inps-ded', 'inpsDed', extracted.inpsDed);
    if (extracted.accImp)   setField('i-acc-imp',  'accImp',  extracted.accImp);
    if (extracted.accInps)  setField('i-acc-inps', 'accInps', extracted.accInps);
  }

  // Credito anno precedente
  const creditoVal = (extracted.credito != null) ? extracted.credito : null;
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