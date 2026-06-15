'use strict';

function gv(id) {
  const v = parseFloat(document.getElementById(id)?.value);
  return isNaN(v) ? 0 : v;
}

function D(v) { return new Decimal(v || 0); }

function calcola() {

  // ── Input ────────────────────────────────────────────────────
  const fatt     = D(gv('i-fatt'));
  const nBolli   = D(gv('i-bolli'));
  const coeff    = D(gv('i-coeff'));
  const aliq     = D(gv('i-aliq'));
  const inpsDed  = D(gv('i-inps-ded'));
  const inpsAliq = D(gv('i-inps-aliq'));
  const accImp   = D(gv('i-acc-imp'));
  const accInps  = D(gv('i-acc-inps'));
  const credito  = D(gv('i-credito'));
  const mesi     = Math.max(1, gv('i-mesi'));

  // ── Fatturato dichiarabile ───────────────────────────────────
  const bolliFatt = nBolli.times(REGOLE.bolloDaBollo.importo);
  const fattTot   = fatt.plus(bolliFatt);

  // ── Reddito ──────────────────────────────────────────────────
  const redLordo  = fattTot.times(coeff).dividedBy(100);
  const redNetto  = Decimal.max(0, redLordo.minus(inpsDed));

  // ── Imposta sostitutiva ──────────────────────────────────────
  const imposta   = Decimal.max(0, redNetto.times(aliq).dividedBy(100));
  const saldoImp  = Decimal.max(0, imposta.minus(accImp).minus(credito));

  // Acconti imposta: metodo storico, 50%+50% (REGOLE.imposta.acconto1/2Pct)
  const acc1Imp   = imposta.times(REGOLE.imposta.acconto1Pct)
                           .toDecimalPlaces(2, Decimal.ROUND_FLOOR);
  const acc2Imp   = imposta.minus(acc1Imp)
                           .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // ── INPS Gestione Separata ───────────────────────────────────
  // Imponibile = reddito lordo forfettario
  const inpsDovCorrente = redLordo.times(inpsAliq).dividedBy(100);
  const saldoInps       = Decimal.max(0, inpsDovCorrente.minus(accInps));

  // INPS anno precedente (per visualizzazione/confronto)
  const inpsDovPrec = (typeof prevYear !== 'undefined' && prevYear && prevYear.inpsDov)
    ? D(prevYear.inpsDov)
    : inpsDovCorrente;

  // Acconti INPS: 40%+40% dell'INPS corrente (REGOLE.inpsGS.acconto1/2Pct)
  const acc1Inps  = inpsDovCorrente.times(REGOLE.inpsGS.acconto1Pct)
                                   .toDecimalPlaces(2, Decimal.ROUND_FLOOR);
  const acc2Inps  = inpsDovCorrente.times(REGOLE.inpsGS.acconto2Pct)
                                   .toDecimalPlaces(2, Decimal.ROUND_FLOOR);

  // ── F24 ──────────────────────────────────────────────────────
  const f1 = saldoImp.plus(acc1Imp).plus(saldoInps).plus(acc1Inps);
  const f2 = acc2Imp.plus(acc2Inps);

  // ── Converti in numeri JS per il rendering ───────────────────
  S = {
    fatt:             fatt.toNumber(),
    nBolli:           nBolli.toNumber(),
    bolliFatt:        bolliFatt.toNumber(),
    fattTot:          fattTot.toNumber(),
    coeff:            coeff.toNumber(),
    aliq:             aliq.toNumber(),
    inpsDed:          inpsDed.toNumber(),
    inpsAliq:         inpsAliq.toNumber(),
    accImp:           accImp.toNumber(),
    accInps:          accInps.toNumber(),
    credito:          credito.toNumber(),
    mesi,
    redLordo:         redLordo.toNumber(),
    redNetto:         redNetto.toNumber(),
    imposta:          imposta.toNumber(),
    inpsDov:          inpsDovCorrente.toNumber(),
    inpsDovCorrente:  inpsDovCorrente.toNumber(),
    inpsDovPrec:      inpsDovPrec.toNumber(),
    saldoImp:         saldoImp.toNumber(),
    saldoInps:        saldoInps.toNumber(),
    acc1Imp:          acc1Imp.toNumber(),
    acc2Imp:          acc2Imp.toNumber(),
    acc1Inps:         acc1Inps.toNumber(),
    acc2Inps:         acc2Inps.toNumber(),
    f1:               f1.toNumber(),
    f2:               f2.toNumber(),
  };

  renderStep2(S);
  renderF24(S);
  renderCfr(S);
  renderAcc(S);
  renderPrint(S);
  goStep(3);
}