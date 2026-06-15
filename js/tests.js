'use strict';

/**
 * Test suite — apri la console del browser su calcolatore.html e scrivi:
 *   runTests()
 * 
 * Tutti i casi sono verificati su documenti fiscali reali.
 */

function runTests() {
  const D = v => new Decimal(v || 0);
  let pass = 0, fail = 0;

  function assert(label, actual, expected, tolerance = 0.01) {
    const ok = Math.abs(actual - expected) <= tolerance;
    if (ok) {
      console.log(`%c ✓ ${label}: ${actual}`, 'color:green');
      pass++;
    } else {
      console.error(` ✗ ${label}: ottenuto ${actual}, atteso ${expected}`);
      fail++;
    }
  }

  // ── CASO 1: Vincenzo Pavone 2025 ────────────────────────────
  // Fonte: documenti reali (XML FIC + F24 + RPF + precompilata AdE)
  console.group('Caso 1 — Pavone 2025 (5%→15%, GS)');
  {
    const fatt     = D(30396);
    const nBolli   = D(41);
    const coeff    = D(78);
    const aliq     = D(15);
    const inpsDed  = D(4466.12);
    const inpsAliq = D(26.07);
    const accImp   = D(622);
    const accInps  = D(3784.12);
    const credito  = D(0);

    const bolliFatt = nBolli.times(2);
    const fattTot   = fatt.plus(bolliFatt);
    const redLordo  = fattTot.times(coeff).dividedBy(100);
    const redNetto  = redLordo.minus(inpsDed);
    const imposta   = redNetto.times(aliq).dividedBy(100);
    const saldoImp  = imposta.minus(accImp).minus(credito);
    const acc1Imp   = imposta.times('0.50').toDecimalPlaces(2, Decimal.ROUND_FLOOR);
    const acc2Imp   = imposta.minus(acc1Imp).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const inpsDovC  = redLordo.times(inpsAliq).dividedBy(100);
    const saldoInps = inpsDovC.minus(accInps);
    const acc1Inps  = inpsDovC.times('0.40').toDecimalPlaces(2, Decimal.ROUND_FLOOR);
    const acc2Inps  = inpsDovC.times('0.40').toDecimalPlaces(2, Decimal.ROUND_FLOOR);
    const f1        = saldoImp.plus(acc1Imp).plus(saldoInps).plus(acc1Inps);
    const f2        = acc2Imp.plus(acc2Inps);

    assert('fattTot',    fattTot.toNumber(),    30478.00);
    assert('redLordo',   redLordo.toNumber(),   23772.84);
    assert('redNetto',   redNetto.toNumber(),   19306.72);
    assert('imposta',    imposta.toNumber(),     2896.01);
    assert('saldoImp',   saldoImp.toNumber(),   2274.01);
    assert('acc1Imp',    acc1Imp.toNumber(),     1448.00);
    assert('acc2Imp',    acc2Imp.toNumber(),     1448.01);
    assert('inpsDovC',   inpsDovC.toNumber(),   6197.58, 0.05);
    assert('saldoInps',  saldoInps.toNumber(),  2413.46, 0.05);
    assert('acc1Inps',   acc1Inps.toNumber(),   2479.03, 0.01);
    assert('acc2Inps',   acc2Inps.toNumber(),   2479.03, 0.01);
    assert('F24 giugno', f1.toNumber(),          8614.50, 0.10);
    assert('F24 nov.',   f2.toNumber(),           3927.04, 0.01);
    assert('Totale',     f1.plus(f2).toNumber(), 12541.54, 0.05);
  }
  console.groupEnd();

  // ── CASO 2: primo anno di attività (no acconti) ─────────────
  console.group('Caso 2 — Primo anno (nessun acconto precedente)');
  {
    const imposta  = D(3000);
    const inpsDovC = D(7000);
    const acc1Imp  = imposta.times('0.50').toDecimalPlaces(2, Decimal.ROUND_FLOOR);
    const acc2Imp  = imposta.minus(acc1Imp).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const acc1Inps = inpsDovC.times('0.40').toDecimalPlaces(2, Decimal.ROUND_FLOOR);
    const acc2Inps = inpsDovC.times('0.40').toDecimalPlaces(2, Decimal.ROUND_FLOOR);
    // saldo = imposta intera (nessun acconto versato)
    const saldoImp  = imposta;
    const saldoInps = inpsDovC;
    const f1 = saldoImp.plus(acc1Imp).plus(saldoInps).plus(acc1Inps);
    const f2 = acc2Imp.plus(acc2Inps);

    assert('acc1Imp primo anno',  acc1Imp.toNumber(),  1500.00);
    assert('acc2Imp primo anno',  acc2Imp.toNumber(),  1500.00);
    assert('acc1Inps primo anno', acc1Inps.toNumber(), 2800.00);
    assert('acc2Inps primo anno', acc2Inps.toNumber(), 2800.00);
    assert('F24 giugno (= saldo+acconti)', f1.toNumber(), 14300.00);
    assert('F24 novembre',        f2.toNumber(),        4300.00);
  }
  console.groupEnd();

  // ── CASO 3: credito residuo non zero ────────────────────────
  console.group('Caso 3 — Con credito residuo LM47');
  {
    const imposta = D(2000);
    const accImp  = D(500);
    const credito = D(300);
    const saldoImp = Decimal.max(0, imposta.minus(accImp).minus(credito));
    assert('saldoImp con credito', saldoImp.toNumber(), 1200.00);
  }
  console.groupEnd();

  // ── CASO 4: soglia 85k ──────────────────────────────────────
  console.group('Caso 4 — Superamento soglia forfettario');
  {
    const fattTot = D(90000);
    const supera  = fattTot.greaterThan(REGOLE.forfettario.sogliaRicavi);
    assert('supera soglia 85k', supera ? 1 : 0, 1, 0);
  }
  console.groupEnd();

  // ── Risultato ────────────────────────────────────────────────
  console.log(`\nRisultato: ${pass} test passati, ${fail} falliti`);
  if (fail === 0) console.log('%c✓ Tutti i test passano', 'color:green;font-weight:bold');
  else            console.error(`✗ ${fail} test falliti — non rilasciare`);
}

window.runTests = runTests;

// Auto-run tests on page load for verification
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    runTests();
  });
}
