# regforcalculator
Calcolatore avanzato regime forfettario

Strumento interattivo per la stima dell'imposta sostitutiva, dei contributi INPS Gestione Separata e dei modelli F24 da versare per i contribuenti italiani in regime forfettario (art. 1, commi 54–89, L. 190/2014).

---

## ⚠️ Avvertenze legali importanti — Leggere prima dell'uso

> **Questo strumento è fornito esclusivamente a titolo dimostrativo, informativo e di uso personale. Non costituisce in alcun modo consulenza fiscale, tributaria, contabile o legale.**

L'utilizzo di questo calcolatore non sostituisce e non può sostituire il parere di un professionista abilitato (commercialista, consulente del lavoro, avvocato tributarista). I risultati prodotti dallo strumento sono **stime indicative** basate sui parametri inseriti dall'utente e sulle aliquote vigenti al momento dello sviluppo, che potrebbero essere cambiate.

**L'autore declina ogni responsabilità per:**

- errori od omissioni nei calcoli prodotti dallo strumento
- decisioni fiscali, tributarie o finanziarie prese sulla base dei risultati ottenuti
- eventuali discrepanze rispetto ai calcoli ufficiali dell'Agenzia delle Entrate o dell'INPS
- variazioni normative, modifiche alle aliquote o aggiornamenti legislativi successivi alla data di pubblicazione
- danni diretti, indiretti, incidentali o consequenziali derivanti dall'uso o dall'impossibilità di uso dello strumento

**Prima di effettuare qualsiasi versamento fiscale, verificare sempre i dati con il proprio commercialista o con i servizi ufficiali dell'Agenzia delle Entrate.**

---

## 🔒 Privacy e dati personali

**Nessun dato viene raccolto, trasmesso o conservato.**

Questo strumento è progettato con un'architettura **completamente client-side**:

- tutti i calcoli vengono eseguiti **esclusivamente nel browser dell'utente**
- i documenti PDF o XML eventualmente caricati vengono elaborati **solo in memoria RAM** e non lasciano mai il dispositivo
- non viene effettuata **alcuna chiamata di rete** verso server esterni durante l'elaborazione dei documenti
- non vengono utilizzati **cookie, localStorage, sessionStorage** o qualsiasi altro meccanismo di persistenza dei dati
- non viene trasmessa **nessuna informazione** a terze parti, incluso l'autore dello strumento
- alla chiusura della scheda del browser, tutti i dati inseriti o caricati vengono **definitivamente eliminati**

Le uniche risorse esterne caricate sono le librerie JavaScript open source utilizzate per il rendering (PDF.js di Mozilla Foundation, Chart.js), scaricate dai rispettivi CDN pubblici. Queste librerie non ricevono alcun dato dell'utente.

---

## 📋 Funzionalità

- Calcolo dell'imposta sostitutiva (5% o 15%) sul reddito netto forfettario
- Calcolo dei contributi INPS Gestione Separata (aliquota configurabile)
- Stima dei modelli F24 da versare (saldi + acconti, giugno e dicembre)
- Estrazione automatica dei dati da documenti fiscali caricati:
  - **F24 PDF** — ricevute di pagamento (codici tributo 0900, 1790, 1791, 1792)
  - **Dichiarazione precompilata PDF** — righi LM22, LM34, LM35, LM43, LM44, LM45
  - **Modello Redditi PDF** — quadri LM e RR
  - **Export FattureInCloud XML** — fatturato totale e conteggio fatture
- Pre-compilazione automatica dei campi dai documenti caricati
- Piano di accantonamento mensile verso le scadenze F24
- Confronto anno precedente vs anno corrente
- Helper contestuali con spiegazioni in linguaggio semplice
- Interfaccia responsive, utilizzabile da desktop e mobile

---

## 🛠️ Tecnologie

| Libreria | Versione | Utilizzo |
|---|---|---|
| [PDF.js](https://mozilla.github.io/pdf.js/) | 3.11.174 | Estrazione testo da PDF, client-side |
| [Chart.js](https://www.chartjs.org/) | 4.4.1 | Grafici e visualizzazioni |

Nessun framework, nessun build tool, nessuna dipendenza da installare. Un singolo file HTML autonomo.

---

## 🚀 Utilizzo

### GitHub Pages

1. Caricare il file `calcolatore_forfettario_pro.html` nella root del repository
2. Andare in **Settings → Pages → Source → Deploy from a branch**
3. Selezionare il branch `main` e la cartella `/ (root)`
4. La pagina sarà disponibile a `https://[username].github.io/[repo]/calcolatore_forfettario_pro.html`

Per renderla la homepage, rinominare il file in `index.html`.

### Uso locale

Aprire direttamente il file HTML in qualsiasi browser moderno. Non richiede server web.

---

## ⚖️ Licenza e condizioni d'uso

Questo strumento è distribuito **esclusivamente per uso personale e dimostrativo**.

- È **vietata** la distribuzione, la vendita o l'integrazione in prodotti commerciali senza autorizzazione esplicita dell'autore
- È **vietato** presentare questo strumento come sostituto di consulenza professionale abilitata
- L'utente che utilizza lo strumento **accetta integralmente** le presenti condizioni e le avvertenze legali sopra riportate
- L'autore si riserva il diritto di modificare, aggiornare o rimuovere lo strumento in qualsiasi momento senza preavviso

---

## 📌 Note tecniche sui calcoli

I calcoli si basano sulla normativa vigente al momento della pubblicazione:

- **Coefficiente di redditività**: definito dal codice ATECO (default 78% per comunicazione/marketing, ATECO 731xxx–741xxx)
- **Aliquota imposta sostitutiva**: 5% per i primi 5 anni di attività, 15% dal sesto anno
- **Aliquota INPS Gestione Separata**: 26,07% (soggetti non pensionati e privi di altra tutela previdenziale, anno 2025)
- **Marca da bollo**: € 2,00 per fattura emessa in esenzione IVA con imponibile > € 77,47 (art. 6 Tariffa All. A, DPR 642/72)
- **Soglia regime forfettario**: € 85.000 di ricavi/compensi annui (L. 197/2022)

Le aliquote e i limiti normativi sono soggetti a variazione annuale. Verificare sempre con le fonti ufficiali prima dell'utilizzo.

---

*Documento aggiornato a giugno 2026.*
