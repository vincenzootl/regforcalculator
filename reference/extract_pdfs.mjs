import { readFileSync } from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const files = [
  { path: 'reference/F24_PVNVCN93R12A662R_RPF25 Ricevuta 1.pdf', label: 'F24 RICEVUTA 1' },
  { path: 'reference/F24_PVNVCN93R12A662R_RPF25 Ricevuta 2.pdf', label: 'F24 RICEVUTA 2' },
  { path: 'reference/F24_PVNVCN93R12A662R_RPF25.pdf',            label: 'F24 DIGITALE' },
  { path: 'reference/PVNVCN93R12A662R_RPF25.pdf',                label: 'RPF DICHIARAZIONE' },
];

for (const { path, label } of files) {
  console.log('\n\n' + '='.repeat(60));
  console.log('>>> ' + label);
  console.log('='.repeat(60));
  try {
    const data = new Uint8Array(readFileSync(path));
    const doc = await getDocument({ data, verbosity: 0 }).promise;
    console.log('Pagine:', doc.numPages);
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      // Ricostruisce righe: items con stessa Y approssimativa sono sulla stessa riga
      const items = content.items;
      let lines = [];
      let curLine = '';
      let lastY = null;
      for (const it of items) {
        const y = Math.round(it.transform[5]);
        if (lastY !== null && Math.abs(y - lastY) > 3) {
          if (curLine.trim()) lines.push(curLine.trim());
          curLine = '';
        }
        curLine += it.str;
        lastY = y;
      }
      if (curLine.trim()) lines.push(curLine.trim());
      // Stampa le righe non vuote
      console.log(`\n--- Pagina ${i} ---`);
      lines.filter(l => l.length > 0).forEach(l => console.log(l));
    }
  } catch(e) {
    console.log('ERRORE:', e.message);
  }
}
