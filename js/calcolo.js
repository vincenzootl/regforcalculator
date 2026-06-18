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
  let inpsAliq   = D(gv('i-inps-aliq'));
  const accImp   = D(gv('i-acc-imp'));
  const accInps  = D(gv('i-acc-inps'));
  const credito  = D(gv('i-credito'));
  const mesi     = Math.max(1, gv('i-mesi'));

  // A prova di zero: se inpsAliq è 0 o vuoto, ripristina il valore da REGOLE
  if (inpsAliq.isZero() && typeof REGOLE !== 'undefined' && REGOLE.inpsGS && REGOLE.inpsGS.aliquota2025) {
    inpsAliq = REGOLE.inpsGS.aliquota2025;
    logWarn(`Aliquota INPS assente o 0: ripristinata al valore di default (${inpsAliq}%)`);
  }

  // ── Cassa previdenziale: INPS disabilitato per non-GS ────────
  const cassa = window.onbCassa || 'gs';
  const cassaInfo = typeof REGOLE !== 'undefined' && REGOLE.cassaPrevidenziale
    ? REGOLE.cassaPrevidenziale[cassa]
    : { supportato: true };
  const inpsDisabilitato = cassaInfo && !cassaInfo.supportato;

  // ── Metodo Acconti ───────────────────────────────────────────
  // Default a 'storico' se l'utente non lo ha esplicitamente cambiato.
  //
  // NOTA CONCETTUALE: questo calcolatore elabora l'ANNO DICHIARATO (es. 2025).
  // Gli acconti dell'anno successivo (es. 2026) col metodo STORICO valgono il
  // 100% dell'imposta dell'anno appena dichiarato = l'`imposta` corrente.
  // Quindi la base degli acconti è SEMPRE l'imposta corrente, non un anno
  // ancora precedente (prevYear, usato solo per il confronto grafico).
  // Il metodo previsionale, in assenza di una stima separata del prossimo anno,
  // coincide con lo storico.
  const elMetodo = document.querySelector('input[name="metodo-acconti"]:checked');
  let metodoAcconti = elMetodo ? elMetodo.value : 'storico';

  // ── Fatturato dichiarabile ───────────────────────────────────
  const bolliFatt = nBolli.times(REGOLE.bolloDaBollo.importo);
  const fattTot   = fatt.plus(bolliFatt);

  // ── Reddito ──────────────────────────────────────────────────
  const redLordo  = fattTot.times(coeff).dividedBy(100);
  const redNetto  = Decimal.max(0, redLordo.minus(inpsDed));

  // ── Imposta sostitutiva (Corrente) ───────────────────────────
  const imposta   = Decimal.max(0, redNetto.times(aliq).dividedBy(100));
  
  // Gestione Saldo e Credito Residuo (Imposta)
  let saldoImp = imposta.minus(accImp).minus(credito);
  let creditoImpResiduo = D(0);
  if (saldoImp.isNegative()) {
    creditoImpResiduo = saldoImp.abs();
    saldoImp = D(0);
  }

  // ── INPS Gestione Separata (Corrente) ────────────────────────
  let inpsDovCorrente = D(0), saldoInps = D(0), creditoInpsResiduo = D(0), inpsDovPrec = D(0);

  if (!inpsDisabilitato) {
    inpsDovCorrente = redLordo.times(inpsAliq).dividedBy(100);
    saldoInps = inpsDovCorrente.minus(accInps);
    if (saldoInps.isNegative()) {
      creditoInpsResiduo = saldoInps.abs();
      saldoInps = D(0);
    }
    inpsDovPrec = (typeof prevYear !== 'undefined' && prevYear && prevYear.inpsDov)
      ? D(prevYear.inpsDov)
      : inpsDovCorrente;
  }

  // ── Funzione calcolo rate acconto con SOGLIE ─────────────────
  function calcolaRateAcconto(baseCalcolo, pctRata1, pctRata2) {
    if (baseCalcolo.lessThanOrEqualTo(REGOLE.acconti.sogliaMinima)) {
      return { r1: D(0), r2: D(0), tot: D(0) }; // Nessun acconto
    }
    const totAcconto = baseCalcolo; // Base al 100% (o 80% per INPS, già passato come baseCalcolo)
    
    if (baseCalcolo.lessThanOrEqualTo(REGOLE.acconti.sogliaRateizzazione)) {
      return { r1: D(0), r2: totAcconto.toDecimalPlaces(2, Decimal.ROUND_HALF_UP), tot: totAcconto }; // Unica rata a novembre
    }
    
    const r1 = totAcconto.times(pctRata1).toDecimalPlaces(2, Decimal.ROUND_FLOOR);
    // Assorbe il resto
    const r2 = totAcconto.minus(r1).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return { r1, r2, tot: totAcconto };
  }

  // ── Acconti Imposta ──────────────────────────────────────────
  // Base = imposta dell'anno dichiarato (corrente). Vale per entrambi i metodi:
  // storico = 100% imposta anno appena chiuso (= corrente); previsionale = stima
  // anno prossimo (in assenza di input dedicato, = corrente).
  const baseImposta = imposta;

  // L'imposta sostitutiva si versa al 100% come acconto storico
  let rateImp = calcolaRateAcconto(baseImposta, REGOLE.imposta.acconto1Pct, REGOLE.imposta.acconto2Pct);
  
  // Utilizzo eventuale credito residuo sugli acconti imposta
  let acc1Imp = rateImp.r1;
  let acc2Imp = rateImp.r2;
  if (creditoImpResiduo.greaterThan(0)) {
    if (acc1Imp.greaterThanOrEqualTo(creditoImpResiduo)) {
      acc1Imp = acc1Imp.minus(creditoImpResiduo);
      creditoImpResiduo = D(0);
    } else {
      creditoImpResiduo = creditoImpResiduo.minus(acc1Imp);
      acc1Imp = D(0);
      if (acc2Imp.greaterThanOrEqualTo(creditoImpResiduo)) {
        acc2Imp = acc2Imp.minus(creditoImpResiduo);
        creditoImpResiduo = D(0);
      } else {
        creditoImpResiduo = creditoImpResiduo.minus(acc2Imp);
        acc2Imp = D(0);
      }
    }
  }

  // ── Acconti INPS ─────────────────────────────────────────────
  let acc1Inps = D(0), acc2Inps = D(0);
  if (!inpsDisabilitato) {
    // Base = INPS dovuto dell'anno dichiarato (corrente), stessa logica dell'imposta.
    const baseInps = inpsDovCorrente;

    // Base acconto INPS è l'80% del dovuto
    const baseInpsAcconto = baseInps.times(REGOLE.inpsGS.totAccontoPct);
    
    // Le percentuali relative alle due rate rispetto all'80% totale sono 50% e 50% 
    // perché 40% + 40% sul totale significa 50% + 50% dell'acconto.
    let rateInps = calcolaRateAcconto(baseInpsAcconto, D('0.5'), D('0.5'));
    acc1Inps = rateInps.r1;
    acc2Inps = rateInps.r2;

    if (creditoInpsResiduo.greaterThan(0)) {
      if (acc1Inps.greaterThanOrEqualTo(creditoInpsResiduo)) {
        acc1Inps = acc1Inps.minus(creditoInpsResiduo);
        creditoInpsResiduo = D(0);
      } else {
        creditoInpsResiduo = creditoInpsResiduo.minus(acc1Inps);
        acc1Inps = D(0);
        if (acc2Inps.greaterThanOrEqualTo(creditoInpsResiduo)) {
          acc2Inps = acc2Inps.minus(creditoInpsResiduo);
          creditoInpsResiduo = D(0);
        } else {
          creditoInpsResiduo = creditoInpsResiduo.minus(acc2Inps);
          acc2Inps = D(0);
        }
      }
    }
  }

  // ── F24 ──────────────────────────────────────────────────────
  const f1 = saldoImp.plus(acc1Imp).plus(saldoInps).plus(acc1Inps);
  const f2 = acc2Imp.plus(acc2Inps);

  // Verifica quadratura
  const totSaldi = saldoImp.plus(saldoInps);
  const totAcc = acc1Imp.plus(acc2Imp).plus(acc1Inps).plus(acc2Inps);
  if (!f1.plus(f2).equals(totSaldi.plus(totAcc))) {
    console.error("ERRORE QUADRATURA: F1+F2 != Saldi + Acconti");
  }

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
    inpsDisabilitato, // flag per UI
    metodoAcconti,
    creditoImpResiduo: creditoImpResiduo.toNumber(),
    creditoInpsResiduo: creditoInpsResiduo.toNumber(),
  };

  renderStep2(S);
  renderF24(S);
  renderCfr(S);
  renderAcc(S);
  renderPrint(S);
  goStep(3);
}