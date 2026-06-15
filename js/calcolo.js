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
  const inpsDov   = fattTot * inpsAliq / 100;
  const saldoImp  = Math.max(0, imposta - accImp - credito);
  const saldoInps = Math.max(0, inpsDov - accInps);
  const acc1Imp   = Math.floor(imposta * 0.4 * 100) / 100;
  const acc2Imp   = Math.round((imposta - acc1Imp) * 100) / 100;
  const acc1Inps  = Math.floor(inpsDov * 0.5 * 100) / 100;
  const acc2Inps  = Math.round((inpsDov - acc1Inps) * 100) / 100;
  const f1 = saldoImp + acc1Imp + saldoInps + acc1Inps;
  const f2 = acc2Imp + acc2Inps;

  S = {fatt,nBolli,bolliFatt,fattTot,coeff,aliq,inpsDed,inpsAliq,accImp,accInps,
       credito,mesi,redLordo,inpsDov,redNetto,imposta,saldoImp,saldoInps,acc1Imp,acc2Imp,acc1Inps,acc2Inps,f1,f2};

  renderStep2(S);
  renderF24(S);
  renderCfr(S);
  renderAcc(S);
  goStep(2);
}