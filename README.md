# regforcalculator

Calcolatore avanzato per il regime forfettario italiano — stima imposta sostitutiva, contributi INPS Gestione Separata e modelli F24 da versare.

---

## ⚠️ Avvertenze legali — Leggere prima dell'uso

> **Questo strumento è fornito esclusivamente a titolo dimostrativo, informativo e di uso personale. Non costituisce in alcun modo consulenza fiscale, tributaria, contabile o legale.**

I risultati prodotti sono **stime indicative** basate sui parametri inseriti e sulle aliquote vigenti al momento dello sviluppo. Prima di effettuare qualsiasi versamento fiscale, verificare sempre con il proprio commercialista o con i servizi ufficiali dell'Agenzia delle Entrate.

L'autore declina ogni responsabilità per errori nei calcoli, decisioni fiscali prese sulla base dei risultati, o variazioni normative successive alla pubblicazione.

---

## 🔒 Privacy e dati personali

**Nessun dato viene raccolto, trasmesso o conservato.**

- Tutti i calcoli avvengono **esclusivamente nel browser dell'utente**
- I documenti PDF o XML caricati vengono elaborati **solo in memoria RAM** e non lasciano mai il dispositivo
- Nessuna chiamata di rete verso server esterni durante l'elaborazione
- Nessun cookie, localStorage o sessionStorage
- Alla chiusura della scheda, tutti i dati vengono definitivamente eliminati

Le uniche risorse esterne sono le librerie JavaScript open source (Decimal.js, PDF.js, Chart.js) scaricate dai rispettivi CDN. Queste librerie non ricevono alcun dato dell'utente.

---

## 📋 Funzionalità

- **Onboarding guidato** — tre domande iniziali (anni nel regime, settore ATECO, cassa previdenziale) per configurare aliquota e coefficiente prima ancora di caricare i documenti
- **Calcolo ad alta precisione** con Decimal.js — nessun errore di floating point sui centesimi
- **Estrazione automatica** dai documenti fiscali caricati:
  - **F24 PDF** — ricevute e modelli digitali (codici tributo 0900, 1790, 1791, 1792)
  - **Dichiarazione dei Redditi / Precompilata PDF** — quadri LM (LM34, LM35, LM38, LM39, LM43, LM44, LM45, LM47) e quadro RR (INPS dovuto)
  - **Export FattureInCloud XML** — fatturato annuo e conteggio fatture con marca da bollo
- **Pre-compilazione automatica** di tutti i campi dai documenti caricati, con badge che distingue i dati estratti da quelli manuali
- **Calcolo F24 completo** con saldi e acconti per giugno e novembre, codici tributo corretti
- **Piano di accantonamento mensile** verso la scadenza di giugno
- **Confronto anno precedente vs anno corrente** con grafico a barre
- **Esportazione PDF** ottimizzata per stampa A4
- **Test suite** eseguibile in console per validazione automatica dei calcoli

---

## 🛠️ Tecnologie

| Libreria | Versione | Utilizzo |
|---|---|---|
| [Decimal.js](https://mikemcl.github.io/decimal.js/) | 10.4.3 | Aritmetica ad alta precisione — nessun errore floating point |
| [PDF.js](https://mozilla.github.io/pdf.js/) | 2.16.105 | Estrazione testo da PDF, client-side |
| [Chart.js](https://www.chartjs.org/) | 4.4.1 | Grafici confronto e accantonamento |

Nessun framework, nessun build tool, nessuna dipendenza da installare. Funziona aprendo direttamente l'HTML nel browser.

---

## 📁 Struttura file

```
regforcalculator/
├── index.html              → Landing page pubblica
├── calcolatore.html        → App a 8 step
├── css/
│   └── style.css           → Stile unico + media query @print
└── js/
    ├── regole.js           → Costanti fiscali (unica fonte di verità)
    ├── parser.js           → Parsing PDF/XML, onboarding, prefill campi
    ├── calcolo.js          → Motore di calcolo con Decimal.js
    ├── ui.js               → Render risultati, grafici, stampa PDF
    └── tests.js            → Suite di test automatici (console)
```

### Flusso degli step

```
Step 0 — Profilo      → anni nel regime, settore ATECO, cassa previdenziale
Step 1 — Documenti    → carica F24, RPF/Precompilata, XML FattureInCloud
Step 2 — Parametri    → verifica e correggi i campi pre-compilati
Step 3 — Calcolo      → passaggi dettagliati del calcolo
Step 4 — F24          → dettaglio versamenti per codice tributo e scadenza
Step 5 — Confronto    → anno precedente vs anno corrente
Step 6 — Accantonamento → rata mensile e utilizzo soglia €85.000
Step 7 — Esporta PDF  → stampa o salva il riepilogo in formato A4
```

## 📌 Logica di calcolo

Tutte le costanti fiscali sono centralizzate in `js/regole.js`. Per aggiornare le aliquote a inizio anno, modificare solo quel file.

### Formule principali

```
fatturato dichiarabile  = fatturato FIC + (n. fatture con bollo × €2,00)
reddito lordo           = fatturato dichiarabile × coefficiente ATECO / 100
reddito imponibile      = max(0, reddito lordo − INPS deducibili)
imposta sostitutiva     = max(0, reddito imponibile × aliquota / 100)

saldo imposta (1792)    = imposta − acconti versati (1790+1791) − credito residuo
1° acconto (1790)       = floor(imposta × 50%)       [metodo storico]
2° acconto (1791)       = imposta − 1° acconto

INPS GS dovuto          = reddito lordo × 26,07% / 100
saldo INPS (0900)       = INPS dovuto − acconti INPS versati (cod.0900 anno corrente)
1° acconto INPS (0900)  = floor(INPS dovuto × 40%)   [Circolare INPS 27/2025]
2° acconto INPS (0900)  = floor(INPS dovuto × 40%)

F24 giugno              = saldo imposta + 1° acc. imposta + saldo INPS + 1° acc. INPS
F24 novembre            = 2° acc. imposta + 2° acc. INPS
```

### Fonti normative

| Regola | Fonte |
|---|---|
| Aliquota INPS GS 26,07% | Circolare INPS n.27 del 30/01/2025 |
| Acconti INPS 80% in due rate uguali | Circolare INPS n.27/2025 — verificato su F24 reali |
| Acconti imposta sostitutiva 50%+50% | Metodo storico — istruzioni AdE modello Redditi PF 2026 |
| Marca da bollo €2,00 soglia €77,47 | DPR 642/72, art. 6 Tariffa All. A |
| Soglia regime forfettario €85.000 | L. 197/2022 |

### INPS deducibili — cosa include

L'INPS deducibile nell'anno solare comprende **tutti** i versamenti con codice 0900 effettuati nell'anno, indipendentemente dal periodo contributivo di riferimento:

```
Esempio 2025:
  saldo INPS 2024 versato a giugno 2025   (cod.0900, periodo 2024)  → deducibile
  1° acconto INPS 2025 versato a giugno   (cod.0900, periodo 2025)  → deducibile
  2° acconto INPS 2025 versato a novembre (cod.0900, periodo 2025)  → deducibile
  ─────────────────────────────────────────────────────────────────
  Totale INPS deducibile 2025 = €682 + €1.892,06 + €1.892,06 = €4.466,12
```

Questo coincide con il dato comunicato dall'INPS all'Agenzia delle Entrate per la precompilata.

---

## ⚖️ Licenza e condizioni d'uso

Distribuito **esclusivamente per uso personale e dimostrativo**.

- È **vietata** la distribuzione, la vendita o l'integrazione in prodotti commerciali senza autorizzazione esplicita dell'autore
- È **vietato** presentare questo strumento come sostituto di consulenza professionale abilitata
- L'autore si riserva il diritto di modificare o rimuovere lo strumento in qualsiasi momento

---

*Aggiornato a giugno 2026 — aliquote e normativa al 30/01/2025.*
