'use strict';

/* ── CALCOLO ─────────────────────────────────────────────────── */
function gv(id) { return parseFloat(document.getElementById(id).value) || 0; }

function calcola() {
  const fatt     = gv('i-fatt'),  nBolli  = gv('i-bolli');
  const coeff    = gv('i-coeff'), aliq    = gv('i-aliq');
  const inpsDed  = gv('i-inps-ded'), inpsAliq = gv('i-inps-aliq');
  const accImp   = gv('i-acc-imp'), accInps  = gv('i-acc-inps');
  const credito  = gv('i-credito'), mesi     = Math.max(1, gv('i-mesi'));

  const bolliFatt = nBolli * 2;
  const fattTot   = fatt + bolliFatt;
  const redLordo  = fattTot * coeff / 100;
  const redNetto  = Math.max(0, redLordo - inpsDed);
  const imposta   = Math.max(0, redNetto * aliq / 100);
  // ── INPS anno corrente (per acconti anno prossimo) ────────────
  // L'imponibile INPS GS = reddito lordo forfettario
  const inpsDovCorrente = redLordo * inpsAliq / 100;

  // ── INPS anno precedente (per calcolare il saldo da versare) ──
  // = estratto dal quadro RR della dichiarazione caricata (prevYear.inpsDov)
  // Se non disponibile, stima dal campo accInps: saldo = dovuto − acconti versati
  // Ma il dovuto anno prec. non lo conosciamo senza RPF → usiamo prevYear
  const inpsDovPrec = (typeof prevYear !== 'undefined' && prevYear && prevYear.inpsDov) ? prevYear.inpsDov : inpsDovCorrente;

  // ── Saldi (debiti residui anno precedente) ────────────────────
  const saldoImp  = Math.max(0, imposta - accImp - credito);
  // saldoInps: INPS dovuto anno corrente meno acconti già versati nell'anno
  const saldoInps = Math.max(0, inpsDovCorrente - accInps);

  // ── Acconti anno prossimo (calcolati sull'anno corrente) ──────
  // Metodo storico: 50% giugno + 50% novembre
  const acc1Imp   = Math.floor(imposta * 0.5 * 100) / 100;
  const acc2Imp   = Math.round((imposta - acc1Imp) * 100) / 100;
  // INPS GS: 40% per ogni rata (80% totale)
  const acc1Inps  = Math.floor(inpsDovCorrente * 0.4 * 100) / 100;
  const acc2Inps  = Math.round((inpsDovCorrente - acc1Inps) * 100) / 100;

  // ── F24 ───────────────────────────────────────────────────────
  const f1 = saldoImp + acc1Imp + saldoInps + acc1Inps;
  const f2 = acc2Imp + acc2Inps;

  S = { fatt, nBolli, bolliFatt, fattTot, coeff, aliq,
        inpsDed, inpsAliq, accImp, accInps, credito, mesi,
        redLordo, inpsDovCorrente, inpsDovPrec, inpsDov: inpsDovCorrente,
        redNetto, imposta, saldoImp, saldoInps,
        acc1Imp, acc2Imp, acc1Inps, acc2Inps, f1, f2 };

  renderStep2(S);
  renderF24(S);
  renderCfr(S);
  renderAcc(S);
  renderPrint(S);
  goStep(3);
}