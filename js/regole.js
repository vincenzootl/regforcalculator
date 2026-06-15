'use strict';

/**
 * REGOLE FISCALI — unica fonte di verità.
 * Aggiornare qui quando cambiano le aliquote, MAI nel codice di calcolo.
 * Fonte: Circolare INPS n.27/2025, istruzioni AdE modello Redditi PF 2026.
 */
const REGOLE = {

  // ── Imposta sostitutiva ─────────────────────────────────────
  imposta: {
    aliquotaOrdinaria:   new Decimal('15'),   // dal 6° anno
    aliquotaAgevolata:   new Decimal('5'),    // primi 5 anni
    // Metodo storico acconti: 100% dell'imposta corrente, split 50%+50%
    // Fonte: istruzioni AdE — è il metodo di default per forfettari
    acconto1Pct:         new Decimal('0.50'),
    acconto2Pct:         new Decimal('0.50'),
  },

  // ── INPS Gestione Separata ──────────────────────────────────
  inpsGS: {
    aliquota2025:        new Decimal('26.07'), // Circolare INPS 27/2025
    aliquota2026:        new Decimal('26.07'), // da aggiornare a gennaio con nuova circolare
    // Acconti: 80% dell'INPS dovuto anno corrente, in due rate uguali (40%+40%)
    // Fonte: Circolare INPS 27/2025 + verificato su F24 reali
    // INPS 2024=4730 → acconti 2025: 1892,06 × 2 = 3784,12 = 4730 × 80% ✓
    totAccontoPct:       new Decimal('0.80'),
    acconto1Pct:         new Decimal('0.40'),
    acconto2Pct:         new Decimal('0.40'),
  },

  // ── Marca da bollo ──────────────────────────────────────────
  bolloDaBollo: {
    importo:             new Decimal('2.00'),
    sogliaEsenzione:     new Decimal('77.47'), // DPR 642/72 art.6
  },

  // ── Regime forfettario ──────────────────────────────────────
  forfettario: {
    sogliaRicavi:        new Decimal('85000'), // L.197/2022
    anniAliquotaRidotta: 5,
  },

  // ── Coefficienti per ATECO ──────────────────────────────────
  coefficienti: {
    '78':  new Decimal('78'),  // professionisti, creativi, IT, design
    '86':  new Decimal('78'),  // professioni sanitarie
    '67':  new Decimal('62'),  // agenti e rappresentanti
    '40':  new Decimal('40'),  // commercio
    '86c': new Decimal('86'),  // artigiani e costruzioni
    '54':  new Decimal('40'),  // ristorazione e alloggio
  },
};
