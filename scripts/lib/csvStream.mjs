// Minimal streaming CSV reader (RFC 4180 quotes, embedded newlines) for multi-hundred-MB files.
import { createReadStream } from 'node:fs';

export async function* csvRecords(file) {
  const stream = createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 });
  let field = '';
  let row = [];
  let inQuotes = false;
  let pendingQuote = false; // saw a quote inside quotes; next char decides
  let header = null;
  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (inQuotes) {
        if (pendingQuote) {
          pendingQuote = false;
          if (c === '"') {
            field += '"';
            continue;
          }
          inQuotes = false;
          // fall through to handle c outside quotes
        } else if (c === '"') {
          pendingQuote = true;
          continue;
        } else {
          field += c;
          continue;
        }
      }
      if (c === '"') inQuotes = true;
      else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field.endsWith('\r') ? field.slice(0, -1) : field);
        field = '';
        if (!header) header = row;
        else if (row.length === header.length) yield Object.fromEntries(header.map((h, j) => [h, row[j]]));
        row = [];
      } else field += c;
    }
  }
  if (pendingQuote) inQuotes = false;
  if (field.length || row.length) {
    row.push(field);
    if (header && row.length === header.length) yield Object.fromEntries(header.map((h, j) => [h, row[j]]));
  }
}
