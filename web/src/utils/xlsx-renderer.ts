import type { WorkBook, WorkSheet, CellObject } from 'xlsx';

interface RenderOptions {
  dark?: boolean;
}

export function renderXlsxSheet(workbook: WorkBook, sheetIndex: number, options: RenderOptions = {}): string {
  const sheetName = workbook.SheetNames[sheetIndex];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return '';

  const ref = sheet['!ref'];
  if (!ref) return '<div class="text-center p-4 text-sm opacity-60">空工作表</div>';

  const range = decodeRange(ref);
  const merges = sheet['!merges'] || [];
  const cols = sheet['!cols'] || [];
  const rows = sheet['!rows'] || [];

  const isDark = options.dark;
  const borderColor = isDark ? '#3a3a3c' : '#d1d1d6';
  const headerBg = isDark ? '#2c2c2e' : '#f5f5f7';
  const cellBg = isDark ? '#1c1c1e' : '#ffffff';
  const textColor = isDark ? '#e0e0e0' : '#1d1d1f';

  // Build merge lookup
  const mergeMap = new Map<string, { r: number; c: number; h: number; w: number }>();
  for (const m of merges) {
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r === m.s.r && c === m.s.c) continue;
        mergeMap.set(`${r}:${c}`, { r: m.s.r, c: m.s.c, h: m.e.r - m.s.r + 1, w: m.e.c - m.s.c + 1 });
      }
    }
  }

  // Colgroup widths
  let html = '<table style="border-collapse:collapse;width:100%;font-size:12px;color:' + textColor + '">';
  html += '<colgroup>';
  for (let c = range.s.c; c <= range.e.c; c++) {
    const col = cols[c];
    const width = col ? (col.wpx ? col.wpx + 'px' : (col.wch ? (col.wch * 7) + 'px' : '80px')) : '80px';
    html += '<col style="width:' + width + '">';
  }
  html += '</colgroup>';

  for (let r = range.s.r; r <= range.e.r; r++) {
    html += '<tr>';
    for (let c = range.s.c; c <= range.e.c; c++) {
      const key = `${r}:${c}`;
      if (mergeMap.has(key)) {
        // This cell is covered by a merge
        continue;
      }

      const cellRef = encodeCell(r, c);
      const cell = sheet[cellRef] as CellObject | undefined;
      const mergeInfo = merges.find(m => m.s.r === r && m.s.c === c);

      if (mergeInfo) {
        const rowspan = mergeInfo.e.r - mergeInfo.s.r + 1;
        const colspan = mergeInfo.e.c - mergeInfo.s.c + 1;
        html += renderCell(sheet[cellRef], { rowspan, colspan, borderColor, headerBg, cellBg, textColor, isDark });
      } else {
        html += renderCell(cell, { borderColor, headerBg, cellBg, textColor, isDark });
      }
    }
    html += '</tr>';
  }

  html += '</table>';
  return html;
}

function renderCell(cell: CellObject | undefined, opts: {
  rowspan?: number;
  colspan?: number;
  borderColor: string;
  headerBg: string;
  cellBg: string;
  textColor: string;
  isDark?: boolean;
}): string {
  const { rowspan, colspan, borderColor, textColor } = opts;
  let styles = 'border:1px solid ' + borderColor + ';padding:4px 6px;';

  if (cell && cell.s) {
    const s = cell.s;

    // Background fill
    if (s.fill && s.fill.fgColor && s.fill.fgColor.rgb) {
      styles += 'background-color:#' + s.fill.fgColor.rgb + ';';
    } else if (s.fill && s.fill.patternType) {
      // Try theme color
    }

    // Font
    if (s.font) {
      const f = s.font;
      let fontStyle = '';
      if (f.bold) fontStyle += 'bold ';
      if (f.italic) fontStyle += 'italic ';
      if (fontStyle) styles += 'font-weight:' + (f.bold ? 'bold' : 'normal') + ';';
      if (f.italic) styles += 'font-style:italic;';
      if (f.sz) styles += 'font-size:' + f.sz + 'px;';
      if (f.name) {
        // Map common Chinese font names
        const fontName = mapFontName(f.name);
        styles += 'font-family:"' + fontName + '",sans-serif;';
      }
      if (f.color && f.color.rgb) {
        styles += 'color:#' + f.color.rgb + ';';
      }
    }

    // Alignment
    if (s.alignment) {
      if (s.alignment.horizontal === 'center') styles += 'text-align:center;';
      else if (s.alignment.horizontal === 'right') styles += 'text-align:right;';
      else if (s.alignment.horizontal === 'left') styles += 'text-align:left;';
      if (s.alignment.vertical === 'top') styles += 'vertical-align:top;';
      else if (s.alignment.vertical === 'middle') styles += 'vertical-align:middle;';
      else if (s.alignment.vertical === 'bottom') styles += 'vertical-align:bottom;';
      if (s.alignment.wrapText) styles += 'word-break:break-word;white-space:pre-wrap;';
    }

    // Border — individual sides
    if (s.border) {
      const b = s.border;
      if (b.top) styles += 'border-top-style:' + b.top.style + ';border-top-color:#' + (b.top.color?.rgb || '000000') + ';';
      if (b.bottom) styles += 'border-bottom-style:' + b.bottom.style + ';border-bottom-color:#' + (b.bottom.color?.rgb || '000000') + ';';
      if (b.left) styles += 'border-left-style:' + b.left.style + ';border-left-color:#' + (b.left.color?.rgb || '000000') + ';';
      if (b.right) styles += 'border-right-style:' + b.right.style + ';border-right-color:#' + (b.right.color?.rgb || '000000') + ';';
    }
  }

  const attrs = styles ? ' style="' + styles + '"' : '';
  const rowspanAttr = rowspan && rowspan > 1 ? ' rowspan="' + rowspan + '"' : '';
  const colspanAttr = colspan && colspan > 1 ? ' colspan="' + colspan + '"' : '';

  const value = renderCellValue(cell, opts);
  return '<td' + attrs + rowspanAttr + colspanAttr + '>' + value + '</td>';
}

function renderCellValue(cell: CellObject | undefined, _opts: { textColor: string }): string {
  if (!cell) return '';

  let text = '';
  if (cell.t === 'n' && cell.w) {
    text = cell.w;
  } else if (cell.t === 's' && cell.v) {
    text = String(cell.v);
  } else if (cell.t === 'b') {
    text = cell.v ? 'TRUE' : 'FALSE';
  } else if (cell.w) {
    text = cell.w;
  } else if (cell.v != null) {
    text = String(cell.v);
  }

  // Escape HTML
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  if (!text) return '&nbsp;';
  return text;
}

function decodeRange(ref: string): { s: { r: number; c: number }; e: { r: number; c: number } } {
  const parts = ref.split(':');
  return {
    s: decodeCell(parts[0]),
    e: decodeCell(parts[1] || parts[0]),
  };
}

function decodeCell(ref: string): { r: number; c: number } {
  const match = ref.match(/([A-Z]+)(\d+)/);
  if (!match) return { r: 0, c: 0 };
  let c = 0;
  for (let i = 0; i < match[1].length; i++) {
    c = c * 26 + match[1].charCodeAt(i) - 64;
  }
  return { r: parseInt(match[2]) - 1, c: c - 1 };
}

function encodeCell(r: number, c: number): string {
  let col = '';
  let n = c + 1;
  while (n > 0) {
    n--;
    col = String.fromCharCode(65 + (n % 26)) + col;
    n = Math.floor(n / 26);
  }
  return col + (r + 1);
}

function mapFontName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('simsun') || lower.includes('宋体')) return 'WenQuanYi Zen Hei';
  if (lower.includes('simhei') || lower.includes('黑体')) return 'WenQuanYi Zen Hei';
  if (lower.includes('yahei') || lower.includes('雅黑')) return 'WenQuanYi Zen Hei';
  if (lower.includes('fang') || lower.includes('仿宋')) return 'WenQuanYi Zen Hei';
  if (lower.includes('kai') || lower.includes('楷')) return 'WenQuanYi Zen Hei';
  return name;
}
