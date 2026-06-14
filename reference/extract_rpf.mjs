import { readFileSync } from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Leggi solo il RPF (file grande)
const path = 'reference/PVNVCN93R12A662R_RPF25.pdf';
console.log('=== RPF DICHIARAZIONE ===');
const data = new Uint8Array(readFileSync(path));
const doc = await getDocument({ data, verbosity: 0 }).promise;
console.log('Pagine totali:', doc.numPages);

// Leggi tutte le pagine, cerca quelle con LM o RR
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  const flat = content.items.map(it => it.str).join(' ');
  
  // Mostra solo pagine rilevanti
  if (/\bLM\d|\bRR\d|\bLM 2[2-9]|\bLM 3|\bLM 4/.test(flat)) {
    console.log('\n\n--- PAGINA', i, '(rilevante) ---');
    // Ricostruisce per Y
    const items = content.items;
    let lines = [];
    let curLine = '';
    let lastY = null;
    for (const it of items) {
      const y = Math.round(it.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 4) {
        if (curLine.trim()) lines.push(curLine.trim());
        curLine = '';
      }
      curLine += it.str + ' ';
      lastY = y;
    }
    if (curLine.trim()) lines.push(curLine.trim());
    lines.filter(l => l.trim().length > 1).forEach(l => console.log(l));
  }
}
