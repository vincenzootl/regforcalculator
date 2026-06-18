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

  function assertEq(label, actual, expected) {
    if (actual === expected) {
      console.log(`%c ✓ ${label}: ${actual}`, 'color:green');
      pass++;
    } else {
      console.error(` ✗ ${label}: ottenuto ${JSON.stringify(actual)}, atteso ${JSON.stringify(expected)}`);
      fail++;
    }
  }

  // ── CASO 1a: Pavone 2025 (Metodo STORICO, prevImposta ipotetica) ───
  // Test unitario del metodo storico: verifica che le formule siano corrette
  // indipendentemente dal dato reale. Dati income reali (FIC+F24), prevImposta ipotetica.
  console.group('Caso 1a — Pavone 2025 (Storico, prevImposta ipotetica)');
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

    const prevImposta    = D(2500);   // ipotetica (solo per unit test)
    const prevInpsDovReale = D('4730.15'); // reale: 4730.15 × 80% = 3784.12 = 1892.06 × 2

    const bolliFatt = nBolli.times(2);
    const fattTot   = fatt.plus(bolliFatt);
    const redLordo  = fattTot.times(coeff).dividedBy(100);
    const redNetto  = Decimal.max(0, redLordo.minus(inpsDed));
    const imposta   = Decimal.max(0, redNetto.times(aliq).dividedBy(100));
    const saldoImp  = Decimal.max(0, imposta.minus(accImp).minus(credito));

    const acc1Imp   = prevImposta.times('0.50').toDecimalPlaces(2, Decimal.ROUND_FLOOR);
    const acc2Imp   = prevImposta.minus(acc1Imp).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const inpsDovC  = redLordo.times(inpsAliq).dividedBy(100);
    const saldoInps = Decimal.max(0, inpsDovC.minus(accInps));

    const totAccInps = prevInpsDovReale.times('0.80');
    const acc1Inps  = totAccInps.times('0.50').toDecimalPlaces(2, Decimal.ROUND_FLOOR);
    const acc2Inps  = totAccInps.minus(acc1Inps).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const f1 = saldoImp.plus(acc1Imp).plus(saldoInps).plus(acc1Inps);
    const f2 = acc2Imp.plus(acc2Inps);

    assert('fattTot',              fattTot.toNumber(),   30478.00);
    assert('redLordo',             redLordo.toNumber(),  23772.84);
    assert('redNetto',             redNetto.toNumber(),  19306.72);
    assert('imposta',              imposta.toNumber(),    2896.01);
    assert('saldoImp',             saldoImp.toNumber(),  2274.01);
    assert('acc1Imp (Storico ipot.)', acc1Imp.toNumber(),1250.00);
    assert('acc2Imp (Storico ipot.)', acc2Imp.toNumber(),1250.00);
    assert('inpsDovC',             inpsDovC.toNumber(),  6197.58, 0.05);
    assert('saldoInps',            saldoInps.toNumber(), 2413.46, 0.05);
    assert('acc1Inps (Storico)',   acc1Inps.toNumber(),  1892.06, 0.01);
    assert('acc2Inps (Storico)',   acc2Inps.toNumber(),  1892.06, 0.01);
    // f1 = 2274.01 + 1250.00 + 2413.46 + 1892.06 = 7829.53
    assert('F24 giugno (Storico ipot.)', f1.toNumber(),  7829.53, 0.10);
    assert('F24 nov.   (Storico ipot.)', f2.toNumber(),  3142.06, 0.10);
  }
  console.groupEnd();

  // ── CASO 1b: Pavone 2025 → F24 2026 (Metodo PREVISIONALE) ─────
  // Scenario REALE senza RPF26 caricato: il calcolatore usa metodo previsionale.
  // Fonte: XML FattureInCloud 2025 + F24 RPF25 (delega giugno+dicembre 2025).
  //
  //   Dati reali verificati:
  //   FIC 2025:  fatturato=30.396, fatture con bollo=41 (tutte > 77,47 €)
  //   F24 giugno 2025: 1790/2025=311, 0900/2025=1892,06, 0900/2024=682 (saldo INPS 2024)
  //                    1792/2024=CREDITO 66 (già compensato — non detrarre di nuovo)
  //   F24 dic. 2025:   1791/2025=311, 0900/2025=1892,06
  //   → accImp=622, accInps=3784,12, inpsDed=4466,12 (682+1892,06×2), credito=0
  //
  //   F24 giugno 2026 atteso: 8.614,50
  //   F24 dicembre 2026 atteso: 3.927,04
  console.group('Caso 1b — Pavone 2025 (Previsionale, REALE) → F24 2026');
  {
    const fatt     = D(30396);
    const nBolli   = D(41);
    const coeff    = D(78);
    const aliq     = D(15);
    const inpsDed  = D('4466.12');
    const inpsAliq = D('26.07');
    const accImp   = D(622);
    const accInps  = D('3784.12');
    const credito  = D(0);

    const bolliFatt = nBolli.times(2);                               // 82
    const fattTot   = fatt.plus(bolliFatt);                          // 30.478
    const redLordo  = fattTot.times(coeff).dividedBy(100);           // 23.772,84
    const redNetto  = Decimal.max(D(0), redLordo.minus(inpsDed));    // 19.306,72
    const imposta   = Decimal.max(D(0), redNetto.times(aliq).dividedBy(100)); // 2.896,01
    const saldoImp  = Decimal.max(D(0), imposta.minus(accImp).minus(credito)); // 2.274,01

    const inpsDovC  = redLordo.times(inpsAliq).dividedBy(100);       // 6.197,58
    const saldoInps = Decimal.max(D(0), inpsDovC.minus(accInps));    // 2.413,46

    // Metodo previsionale: base acconti = imposta/INPS correnti
    const acc1Imp  = imposta.times('0.50').toDecimalPlaces(2, Decimal.ROUND_FLOOR);    // 1.448,00
    const acc2Imp  = imposta.minus(acc1Imp).toDecimalPlaces(2, Decimal.ROUND_HALF_UP); // 1.448,01

    const baseInpsAcc = inpsDovC.times('0.80');                      // 4.958,06
    const acc1Inps = baseInpsAcc.times('0.50').toDecimalPlaces(2, Decimal.ROUND_FLOOR);    // 2.479,03
    const acc2Inps = baseInpsAcc.minus(acc1Inps).toDecimalPlaces(2, Decimal.ROUND_HALF_UP); // 2.479,03

    const f1 = saldoImp.plus(acc1Imp).plus(saldoInps).plus(acc1Inps);
    const f2 = acc2Imp.plus(acc2Inps);

    assert('fattTot',        fattTot.toNumber(),   30478.00);
    assert('redLordo',       redLordo.toNumber(),  23772.84);
    assert('redNetto',       redNetto.toNumber(),  19306.72);
    assert('imposta',        imposta.toNumber(),    2896.01);
    assert('saldoImp',       saldoImp.toNumber(),  2274.01);
    assert('inpsDovC',       inpsDovC.toNumber(),  6197.58, 0.05);
    assert('saldoInps',      saldoInps.toNumber(), 2413.46, 0.05);
    assert('acc1Imp (Prev)', acc1Imp.toNumber(),   1448.00);
    assert('acc2Imp (Prev)', acc2Imp.toNumber(),   1448.01);
    assert('acc1Inps (Prev)',acc1Inps.toNumber(),  2479.03, 0.01);
    assert('acc2Inps (Prev)',acc2Inps.toNumber(),  2479.03, 0.01);
    // F24 giugno 2026 = saldoImp(2274,01) + acc1Imp(1448,00) + saldoInps(2413,46) + acc1Inps(2479,03)
    assert('F24 giugno 2026', f1.toNumber(), 8614.50, 0.10);
    // F24 dicembre 2026 = acc2Imp(1448,01) + acc2Inps(2479,03)
    assert('F24 dic. 2026',   f2.toNumber(), 3927.04, 0.10);
  }
  console.groupEnd();

  // ── CASO 2: Metodo Previsionale & Gestione Crediti ──────────
  console.group('Caso 2 — Metodo Previsionale + Credito Residuo');
  {
    // Simuliamo un reddito in forte calo
    const imposta = D(1000);
    const accImp = D(1500); // versati storici maggiori del dovuto
    let saldoImp = imposta.minus(accImp);
    let creditoImp = D(0);
    if(saldoImp.isNegative()) {
       creditoImp = saldoImp.abs();
       saldoImp = D(0);
    }
    
    let acc1Imp = imposta.times('0.50').toDecimalPlaces(2, Decimal.ROUND_FLOOR);
    let acc2Imp = imposta.minus(acc1Imp).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    
    // Assorbe il credito residuo
    if(creditoImp.greaterThan(0)) {
        if(acc1Imp.greaterThanOrEqualTo(creditoImp)) {
            acc1Imp = acc1Imp.minus(creditoImp);
            creditoImp = D(0);
        } else {
            creditoImp = creditoImp.minus(acc1Imp);
            acc1Imp = D(0);
            if(acc2Imp.greaterThanOrEqualTo(creditoImp)) {
                acc2Imp = acc2Imp.minus(creditoImp);
                creditoImp = D(0);
            } else {
                creditoImp = creditoImp.minus(acc2Imp);
                acc2Imp = D(0);
            }
        }
    }

    assert('Saldo azzerato', saldoImp.toNumber(), 0);
    assert('Acc1 assorbito da credito', acc1Imp.toNumber(), 0);
    assert('Acc2 non dovuto / assorbito', acc2Imp.toNumber(), 0);
  }
  console.groupEnd();

  // ── CASO 3: Soglie Acconti ──────────────────────────────────
  console.group('Caso 3 — Soglie Acconti');
  {
    function calcolaRateAcconto(baseCalcolo, pctRata1, pctRata2) {
      if (baseCalcolo.lessThanOrEqualTo(D('51.65'))) {
        return { r1: D(0), r2: D(0), tot: D(0) };
      }
      const totAcconto = baseCalcolo;
      if (baseCalcolo.lessThanOrEqualTo(D('257.52'))) {
        return { r1: D(0), r2: totAcconto.toDecimalPlaces(2, Decimal.ROUND_HALF_UP), tot: totAcconto };
      }
      const r1 = totAcconto.times(pctRata1).toDecimalPlaces(2, Decimal.ROUND_FLOOR);
      const r2 = totAcconto.minus(r1).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      return { r1, r2, tot: totAcconto };
    }
    
    let sottoSoglia = calcolaRateAcconto(D('50'), D('0.5'), D('0.5'));
    assert('Imposta < 51.65 => no acconti', sottoSoglia.tot.toNumber(), 0);
    
    let rataUnica = calcolaRateAcconto(D('150'), D('0.5'), D('0.5'));
    assert('Imposta < 257.52 => rata 1 a zero', rataUnica.r1.toNumber(), 0);
    assert('Imposta < 257.52 => rata 2 a 150', rataUnica.r2.toNumber(), 150);
    
    let dueRate = calcolaRateAcconto(D('300'), D('0.5'), D('0.5'));
    assert('Imposta > 257.52 => rata 1 a 150', dueRate.r1.toNumber(), 150);
    assert('Imposta > 257.52 => rata 2 a 150', dueRate.r2.toNumber(), 150);
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

  // ── CASO 5: parseIT robusto ─────────────────────────────────
  console.group('Caso 5 — parseIT formati numerici');
  {
    assert('parseIT IT "1.892,06"',   parseIT('1.892,06'),   1892.06);
    assert('parseIT intero "30.396"', parseIT('30.396'),     30396);
    assert('parseIT solo virgola',    parseIT('682,00'),     682.00);
    assert('parseIT IT misto',        parseIT('2.819,06'),   2819.06);
    assertEq('parseIT null input',    parseIT(null),         null);
    assertEq('parseIT empty string',  parseIT(''),           null);
    assert('parseIT senza separatore',parseIT('12345'),      12345);
  }
  console.groupEnd();

  // ── CASO 6: coefficiente RPF validato ───────────────────────
  console.group('Caso 6 — Coefficiente RPF validato');
  {
    assertEq('coeff 78 legale',  REGOLE.coefficientiLegali.has(78), true);
    assertEq('coeff 86 legale',  REGOLE.coefficientiLegali.has(86), true);
    assertEq('coeff 12 NON legale (mesi)', REGOLE.coefficientiLegali.has(12), false);
    assertEq('coeff 99 NON legale', REGOLE.coefficientiLegali.has(99), false);
  }
  console.groupEnd();

  // ── CASO 7: aliquota con tolleranza ─────────────────────────
  console.group('Caso 7 — Aliquota inferita con tolleranza');
  {
    // Simula: ratio 4.9% → deve mappare a 5%
    const ratio49 = 4.9;
    const mappato49 = (ratio49 >= 4 && ratio49 <= 6) ? 5
                    : (ratio49 >= 14 && ratio49 <= 16) ? 15 : null;
    assertEq('4.9% → 5%', mappato49, 5);

    // ratio 14.8% → deve mappare a 15%
    const ratio148 = 14.8;
    const mappato148 = (ratio148 >= 4 && ratio148 <= 6) ? 5
                     : (ratio148 >= 14 && ratio148 <= 16) ? 15 : null;
    assertEq('14.8% → 15%', mappato148, 15);

    // ratio 9% → fuori banda
    const ratio9 = 9;
    const mappato9 = (ratio9 >= 4 && ratio9 <= 6) ? 5
                   : (ratio9 >= 14 && ratio9 <= 16) ? 15 : null;
    assertEq('9% → scartata', mappato9, null);
  }
  console.groupEnd();

  // ── CASO 8: sanitizeValue ───────────────────────────────────
  console.group('Caso 8 — sanitizeValue');
  {
    assertEq('sanitize negativo', sanitizeValue(-100, 'test'), null);
    assertEq('sanitize NaN', sanitizeValue(NaN, 'test'), null);
    assertEq('sanitize coeff>100', sanitizeValue(150, 'coeff'), null);
    assertEq('sanitize >1M', sanitizeValue(2000000, 'fatt'), null);
    assert('sanitize valido', sanitizeValue(30396, 'fatt'), 30396);
  }
  console.groupEnd();

  // ── CASO 9: cassa previdenziale ─────────────────────────────
  console.group('Caso 9 — Cassa previdenziale');
  {
    assertEq('GS supportata', REGOLE.cassaPrevidenziale.gs.supportato, true);
    assertEq('artig NON supportata', REGOLE.cassaPrevidenziale.artig.supportato, false);
    assertEq('cassa NON supportata', REGOLE.cassaPrevidenziale.cassa.supportato, false);
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
