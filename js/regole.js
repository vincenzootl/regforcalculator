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
    aliquota2026:        new Decimal('26.07'), // ✓ confermata — Circolare INPS 2026
    // Acconti: 80% dell'INPS dovuto anno corrente, in due rate uguali (40%+40%)
    // Fonte: Circolare INPS 27/2025 + verificato su F24 reali
    // INPS 2024=4730 → acconti 2025: 1892,06 × 2 = 3784,12 = 4730 × 80% ✓
    totAccontoPct:       new Decimal('0.80'),
    acconto1Pct:         new Decimal('0.40'),
    acconto2Pct:         new Decimal('0.40'),
  },

  // ── Acconti ─────────────────────────────────────────────────
  acconti: {
    // Fonte: Istruzioni Modello Redditi PF (soglie minime di versamento)
    // Se base acconto <= 51.65: nessun acconto dovuto.
    sogliaMinima: new Decimal('51.65'),
    // Se base acconto tra 51.66 e 257.52: unica rata a novembre (seconda scadenza).
    // Se base acconto > 257.52: due rate (giugno e novembre).
    sogliaRateizzazione: new Decimal('257.52')
  },

  // ── Marca da bollo ──────────────────────────────────────────
  bolloDaBollo: {
    importo:             new Decimal('2.00'),
    sogliaEsenzione:     new Decimal('77.47'), // DPR 642/72 art.6
  },

  // ── Regime forfettario ──────────────────────────────────────
  forfettario: {
    sogliaRicavi:        new Decimal('85000'), // L.197/2022, confermata L.207/2024 (manovra 2025)
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

  // ── Coefficienti legali (per validazione RPF) ─────────────
  // Unica fonte di verità: usati da parser.js per scartare
  // valori estratti che non sono coefficienti reali (es. mesi=12)
  coefficientiLegali: new Set([40, 54, 62, 67, 74, 78, 86]),

  // ── Cassa previdenziale ───────────────────────────────────
  // Questo calcolatore gestisce SOLO la Gestione Separata INPS.
  // Artigiani/Commercianti e Casse professionali hanno meccanismi
  // contributivi diversi: il calcolo INPS viene disabilitato.
  cassaPrevidenziale: {
    gs:    { supportato: true,  label: 'Gestione Separata INPS' },
    artig: { supportato: false, label: 'Artigiani/Commercianti INPS' },
    cassa: { supportato: false, label: 'Cassa professionale' },
  },
};
