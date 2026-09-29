// Parses Python literal notation as found in some Cannlytics CSV cells:
//   [{'name': 'Myrcene', 'value': 0.42, 'limit': None, 'units': ''}]
// Supports lists, tuples, dicts, single/double-quoted strings, numbers, None/True/False/nan/inf.

export function parsePyLiteral(text) {
  let i = 0;
  const s = text;
  const ws = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };
  const fail = (msg) => {
    throw new Error(`${msg} at ${i}`);
  };
  function value() {
    ws();
    const c = s[i];
    if (c === '[' || c === '(') return seq(c === '[' ? ']' : ')');
    if (c === '{') return dict();
    if (c === "'" || c === '"') return str();
    if (/[-+0-9.]/.test(c)) return num();
    for (const [word, v] of [
      ['None', null],
      ['True', true],
      ['False', false],
      ['nan', null],
      ['NaN', null],
      ['inf', null],
    ]) {
      if (s.startsWith(word, i)) {
        i += word.length;
        return v;
      }
    }
    return fail(`unexpected ${c}`);
  }
  function seq(close) {
    i++;
    const out = [];
    ws();
    if (s[i] === close) {
      i++;
      return out;
    }
    for (;;) {
      out.push(value());
      ws();
      if (s[i] === ',') {
        i++;
        ws();
        if (s[i] === close) {
          i++;
          return out;
        }
        continue;
      }
      if (s[i] === close) {
        i++;
        return out;
      }
      return fail('expected , or ' + close);
    }
  }
  function dict() {
    i++;
    const out = {};
    ws();
    if (s[i] === '}') {
      i++;
      return out;
    }
    for (;;) {
      const k = value();
      ws();
      if (s[i] !== ':') return fail('expected :');
      i++;
      out[String(k)] = value();
      ws();
      if (s[i] === ',') {
        i++;
        ws();
        if (s[i] === '}') {
          i++;
          return out;
        }
        continue;
      }
      if (s[i] === '}') {
        i++;
        return out;
      }
      return fail('expected , or }');
    }
  }
  function str() {
    const q = s[i++];
    let out = '';
    while (i < s.length && s[i] !== q) {
      if (s[i] === '\\') {
        const n = s[i + 1];
        out += n === 'n' ? '\n' : n === 't' ? '\t' : n;
        i += 2;
      } else out += s[i++];
    }
    i++;
    return out;
  }
  function num() {
    const m = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(s.slice(i, i + 40));
    if (!m) return fail('bad number');
    i += m[0].length;
    return Number(m[0]);
  }
  const v = value();
  return v;
}

/** JSON first (fast path), Python literal as fallback; [] when neither works. */
export function parseResultsCell(cell) {
  if (!cell) return [];
  try {
    return JSON.parse(cell);
  } catch {
    try {
      return parsePyLiteral(cell);
    } catch {
      return [];
    }
  }
}
