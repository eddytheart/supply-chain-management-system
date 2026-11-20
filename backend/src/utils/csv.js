// Turns an array of objects into CSV text and sends it as a download (FR17: export reports).
function escapeCell(value) {
  if (value === null || value === undefined) return '';
  return `"${String(value).replace(/"/g, '""')}"`;
}

function toCsv(rows, headers) {
  const cols = headers || (rows.length ? Object.keys(rows[0]) : []);
  const lines = [cols.map(escapeCell).join(',')];
  for (const row of rows) lines.push(cols.map((c) => escapeCell(row[c])).join(','));
  return lines.join('\r\n');
}

function sendCsv(res, filename, rows, headers) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(rows, headers));
}

module.exports = { toCsv, sendCsv };
