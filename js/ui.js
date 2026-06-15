'use strict';

/* ── RENDER STEP 2 ───────────────────────────────────────────── */
function renderStep2(s) {
  document.getElementById('r-f1').textContent = fmtEur(s.f1);
  document.getElementById('r-f2').textContent = fmtEur(s.f2);
  document.getElementById('r-tot').textContent = fmtEur(s.f1 + s.f2);

  document.getElementById('steps-out').innerHTML = `
    <div class="step-row"><span class="step-lbl">Fatturato dichiarato</span><span class="step-val">${fmtEur(s.fatt)}</span></div>
    <div class="step-row"><span class="step-lbl op">+ Marche da bollo (${s.nBolli} × €2)</span><span class="step-val">${fmtEur(s.bolliFatt)}</span></div>
    <div class="step-row sub-total"><span class="step-lbl" style="font-weight:600">= Fatturato reale da dichiarare</span><span class="step-val accent">${fmtEur(s.fattTot)}</span></div>
    <div class="step-divider"></div>
    <div class="step-row"><span class="step-lbl op">× Coefficiente redditività ${s.coeff}%</span><span class="step-val">${fmtEur(s.redLordo)}</span></div>
    <div class="step-row"><span class="step-lbl op">− Contributi INPS deducibili</span><span class="step-val neg">− ${fmtEur(s.inpsDed)}</span></div>
    <div class="step-row sub-total"><span class="step-lbl" style="font-weight:600">= Reddito netto imponibile</span><span class="step-val accent">${fmtEur(s.redNetto)}</span></div>
    <div class="step-divider"></div>
    <div class="step-row"><span class="step-lbl op">× Imposta sostitutiva ${s.aliq}%</span><span class="step-val">${fmtEur(s.imposta)}</span></div>
    <div class="step-row"><span class="step-lbl op">− Acconti imp. sost. versati</span><span class="step-val neg">− ${fmtEur(s.accImp)}</span></div>
    <div class="step-row"><span class="step-lbl op">− Credito anno precedente</span><span class="step-val neg">− ${fmtEur(s.credito)}</span></div>
    <div class="step-row sub-total"><span class="step-lbl" style="font-weight:600">= Saldo imposta da versare</span><span class="step-val accent">${fmtEur(s.saldoImp)}</span></div>
    <div class="step-divider"></div>
    <div class="step-row"><span class="step-lbl">INPS GS dovuto (${s.inpsAliq}% × reddito lordo forfettario (anno corrente))</span><span class="step-val">${fmtEur(s.inpsDov)}</span></div>
    <div class="step-row"><span class="step-lbl op">− Acconti INPS versati</span><span class="step-val neg">− ${fmtEur(s.accInps)}</span></div>
    <div class="step-row sub-total"><span class="step-lbl" style="font-weight:600">= Saldo INPS da versare</span><span class="step-val accent">${fmtEur(s.saldoInps)}</span></div>`;

  document.getElementById('mini-cards-calc').innerHTML = `
    <div class="mini-card"><div class="mini-lbl">Fatturato reale</div><div class="mini-val">${fmtInt(s.fattTot)}</div><div class="mini-sub">+${fmtInt(s.bolliFatt)} bolli</div></div>
    <div class="mini-card blue"><div class="mini-lbl">Reddito lordo</div><div class="mini-val">${fmtInt(s.redLordo)}</div><div class="mini-sub">${s.coeff}% fatturato</div></div>
    <div class="mini-card amber"><div class="mini-lbl">INPS dovuto</div><div class="mini-val">${fmtInt(s.inpsDov)}</div><div class="mini-sub">${s.inpsAliq}% red. lordo</div></div>
    <div class="mini-card red"><div class="mini-lbl">Imposta sost.</div><div class="mini-val">${fmtInt(s.imposta)}</div><div class="mini-sub">Aliquota ${s.aliq}%</div></div>
    <div class="mini-card"><div class="mini-lbl">Reddito netto</div><div class="mini-val">${fmtInt(s.redNetto)}</div><div class="mini-sub">Base imposta</div></div>
    <div class="mini-card green"><div class="mini-lbl">Carico fiscale reale</div><div class="mini-val">${fmtInt(s.imposta+s.inpsDov)}</div><div class="mini-sub">Imposta + INPS</div></div>`;
}

/* ── RENDER F24 ──────────────────────────────────────────────── */
function renderF24(s) {
  document.getElementById('f1-badge').textContent  = fmtEur(s.f1);
  document.getElementById('f1r1').textContent = fmtEur(s.saldoImp);
  document.getElementById('f1r2').textContent = fmtEur(s.acc1Imp);
  document.getElementById('f1r3').textContent = fmtEur(s.saldoInps);
  document.getElementById('f1r4').textContent = fmtEur(s.acc1Inps);
  document.getElementById('f1tot').textContent = fmtEur(s.f1);
  document.getElementById('f2-badge').textContent  = fmtEur(s.f2);
  document.getElementById('f2r1').textContent = fmtEur(s.acc2Imp);
  document.getElementById('f2r2').textContent = fmtEur(s.acc2Inps);
  document.getElementById('f2tot').textContent = fmtEur(s.f2);
  document.getElementById('f24-tot').textContent   = fmtInt(s.f1 + s.f2);
  document.getElementById('f24-saldi').textContent = fmtInt(s.saldoImp + s.saldoInps);
  document.getElementById('f24-reale').textContent = fmtInt(s.imposta + s.inpsDov);
}

/* ── RENDER CONFRONTO ────────────────────────────────────────── */
function renderCfr(s) {
  const p = prevYear;
  const pFatt     = p.fatt    || 0;
  const pImposta  = p.imposta || 0;
  const pInps     = p.inpsDov || 0;
  const pReale    = pImposta + pInps;
  const hasPrev   = pFatt > 0 || pImposta > 0;

  const delta = (a, b) => {
    const d = Math.round(a - b);
    if (!hasPrev || b === 0) return '';
    return `<span class="badge ${d >= 0 ? 'up' : 'dn'}">${d >= 0 ? '+' : ''}€${Math.abs(d).toLocaleString('it-IT')}</span>`;
  };

  document.getElementById('cfr-cards').innerHTML = `
    <div class="mini-card"><div class="mini-lbl">Fatturato prec.</div><div class="mini-val">${hasPrev ? fmtInt(pFatt) : '—'}</div></div>
    <div class="mini-card blue"><div class="mini-lbl">Fatturato corrente</div><div class="mini-val">${fmtInt(s.fattTot)}</div><div class="mini-sub">${delta(s.fattTot, pFatt)}</div></div>
    <div class="mini-card"><div class="mini-lbl">Imposta precedente</div><div class="mini-val">${hasPrev ? fmtInt(pImposta) : '—'}</div></div>
    <div class="mini-card red"><div class="mini-lbl">Imposta corrente</div><div class="mini-val">${fmtInt(s.imposta)}</div><div class="mini-sub">${delta(s.imposta, pImposta)}</div></div>
    <div class="mini-card"><div class="mini-lbl">INPS precedente</div><div class="mini-val">${hasPrev ? fmtInt(pInps) : '—'}</div></div>
    <div class="mini-card amber"><div class="mini-lbl">INPS corrente</div><div class="mini-val">${fmtInt(s.inpsDov)}</div><div class="mini-sub">${delta(s.inpsDov, pInps)}</div></div>`;

  const newData = [Math.round(s.fattTot), Math.round(s.redNetto), Math.round(s.imposta), Math.round(s.inpsDov), Math.round(s.imposta+s.inpsDov)];
  const prevData = hasPrev ? [Math.round(pFatt), 0, Math.round(pImposta), Math.round(pInps), Math.round(pReale)] : null;

  if (chartCfr) {
    if (prevData) chartCfr.data.datasets[0].data = prevData;
    chartCfr.data.datasets[1].data = newData;
    chartCfr.update();
  } else {
    chartCfr = new Chart(document.getElementById('chartCfr'), {
      type: 'bar',
      data: {
        labels: ['Fatturato','Reddito netto','Imposta','INPS GS','Carico fiscale'],
        datasets: [
          { label: hasPrev ? 'Anno precedente' : '', data: prevData || [0,0,0,0,0],
            backgroundColor: '#E2E8F0', borderRadius: 5, borderSkipped: false },
          { label: 'Anno corrente', data: newData,
            backgroundColor: '#3B82F6', borderRadius: 5, borderSkipped: false }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display: hasPrev, labels:{font:{size:11},color:'#64748B'} },
          tooltip:{callbacks:{label:c=>c.dataset.label+': €'+c.raw.toLocaleString('it-IT')}} },
        scales:{
          x:{ticks:{color:'#94A3B8',font:{size:10}},grid:{display:false}},
          y:{ticks:{color:'#94A3B8',font:{size:10},callback:v=>'€'+Math.round(v/1000)+'k'},grid:{color:'rgba(15,23,42,.05)'}}
        }
      }
    });
  }
}

/* ── RENDER ACCANTONAMENTO ───────────────────────────────────── */
function renderAcc(s) {
  const rate = s.f1 / s.mesi;
  document.getElementById('acc-rate').textContent = fmtInt(rate) + '/mese';

  const pct = Math.min(100, (s.fattTot / 85000) * 100);
  document.getElementById('soglia-fill').style.width = pct.toFixed(1) + '%';
  document.getElementById('soglia-pct').textContent = pct.toFixed(1) + '%';
  document.getElementById('soglia-fatt').textContent = 'Fatturato: ' + fmtInt(s.fattTot);
  document.getElementById('soglia-margine').textContent = 'Margine: ' + fmtInt(Math.max(0, 85000 - s.fattTot));

  const labels = Array.from({length: s.mesi}, (_,i) => 'M'+(i+1));
  const data   = Array.from({length: s.mesi}, (_,i) => Math.round(rate*(i+1)));

  if (chartAcc) {
    chartAcc.data.labels = labels;
    chartAcc.data.datasets[0].data = data;
    chartAcc.options.scales.y.max = Math.ceil(s.f1/1000)*1000;
    chartAcc.update();
  } else {
    chartAcc = new Chart(document.getElementById('chartAcc'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Accantonato',
          data,
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59,130,246,.08)',
          fill: true, tension: 0.35,
          pointRadius: 4, pointBackgroundColor: '#3B82F6',
          pointBorderColor: '#fff', pointBorderWidth: 2
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>'€ '+c.raw.toLocaleString('it-IT')}} },
        scales:{
          x:{ticks:{color:'#94A3B8',font:{size:10}},grid:{display:false}},
          y:{ min:0, max:Math.ceil(s.f1/1000)*1000,
            ticks:{color:'#94A3B8',font:{size:10},callback:v=>'€'+Math.round(v/1000)+'k'},
            grid:{color:'rgba(15,23,42,.05)'} }
        }
      }
    });
  }
}

function renderPrint(s) {
  // Data corrente
  const d = new Date();
  const dateEl = document.getElementById('print-current-date');
  if (dateEl) dateEl.textContent = 'Data: ' + d.toLocaleDateString('it-IT');

  // Profilo
  const atecoLabel = typeof onbState !== 'undefined' && onbState.ateco
    ? (ATECO_MAP[onbState.ateco]?.label || 'Personalizzato')
    : 'Generico';
  const atecoEl = document.getElementById('p-ateco');
  if (atecoEl) atecoEl.textContent = atecoLabel;
  const aliqEl = document.getElementById('p-aliq');
  if (aliqEl) aliqEl.textContent = s.aliq;
  const fattEl = document.getElementById('p-fatt');
  if (fattEl) fattEl.textContent = fmtEur(s.fatt);
  const coeffEl = document.getElementById('p-coeff');
  if (coeffEl) coeffEl.textContent = s.coeff;
  const inpsDedEl = document.getElementById('p-inps-ded');
  if (inpsDedEl) inpsDedEl.textContent = fmtEur(s.inpsDed);
  const creditoEl = document.getElementById('p-credito');
  if (creditoEl) creditoEl.textContent = fmtEur(s.credito);

  // Riepilogo Calcolo
  const calcFattEl = document.getElementById('p-calc-fatt');
  if (calcFattEl) calcFattEl.textContent = fmtEur(s.fattTot);
  const calcNettoEl = document.getElementById('p-calc-netto');
  if (calcNettoEl) calcNettoEl.textContent = fmtEur(s.redNetto);
  const calcImpEl = document.getElementById('p-calc-imp');
  if (calcImpEl) calcImpEl.textContent = fmtEur(s.imposta);
  const calcInpsEl = document.getElementById('p-calc-inps');
  if (calcInpsEl) calcInpsEl.textContent = fmtEur(s.inpsDovCorrente);
  const calcSaldoImpEl = document.getElementById('p-calc-saldo-imp');
  if (calcSaldoImpEl) calcSaldoImpEl.textContent = fmtEur(s.saldoImp);
  const calcSaldoInpsEl = document.getElementById('p-calc-saldo-inps');
  if (calcSaldoInpsEl) calcSaldoInpsEl.textContent = fmtEur(s.saldoInps);

  // F24 Giugno
  const f1TotEl = document.getElementById('p-f1-tot');
  if (f1TotEl) f1TotEl.textContent = fmtEur(s.f1);
  const f1r1El = document.getElementById('p-f1-r1');
  if (f1r1El) f1r1El.textContent = fmtEur(s.saldoImp);
  const f1r2El = document.getElementById('p-f1-r2');
  if (f1r2El) f1r2El.textContent = fmtEur(s.acc1Imp);
  const f1r3El = document.getElementById('p-f1-r3');
  if (f1r3El) f1r3El.textContent = fmtEur(s.saldoInps);
  const f1r4El = document.getElementById('p-f1-r4');
  if (f1r4El) f1r4El.textContent = fmtEur(s.acc1Inps);

  // F24 Dicembre
  const f2TotEl = document.getElementById('p-f2-tot');
  if (f2TotEl) f2TotEl.textContent = fmtEur(s.f2);
  const f2r1El = document.getElementById('p-f2-r1');
  if (f2r1El) f2r1El.textContent = fmtEur(s.acc2Imp);
  const f2r2El = document.getElementById('p-f2-r2');
  if (f2r2El) f2r2El.textContent = fmtEur(s.acc2Inps);
}

function exportPDF() {
  window.print();
}
window.exportPDF = exportPDF;
window.renderPrint = renderPrint;