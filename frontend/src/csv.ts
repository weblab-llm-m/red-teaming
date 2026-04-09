// CSV パーサー
export function parseCSV<T>(csvText: string): T[] {
  const records = splitCSVRecords(csvText.trim());
  if (records.length < 2) return [];

  const headers = parseCSVLine(records[0]);
  const results: T[] = [];

  for (let i = 1; i < records.length; i++) {
    const values = parseCSVLine(records[i]);
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] || '';
    });
    results.push(obj as T);
  }

  return results;
}

// CSV をレコード単位に分割（ダブルクォート内の改行を考慮）
function splitCSVRecords(csvText: string): string[] {
  const records: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === '\n' && !inQuotes) {
      if (current.trim()) {
        records.push(current);
      }
      current = '';
    } else if (char === '\r' && !inQuotes) {
      // skip CR
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    records.push(current);
  }

  return records;
}

// CSV 行をパース（ダブルクォート対応）
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);

  return result;
}
