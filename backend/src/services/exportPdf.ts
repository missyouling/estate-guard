import PDFDocument from 'pdfkit';
import type * as PDFKit from 'pdfkit';
import fs from 'fs';
import path from 'path';

function getFontPath(): string {
  const paths = [
    '/app/fonts/NotoSansSC-Regular.otf',
    '/app/fonts/NotoSansSC-Regular.ttf',
    '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return '';
}

export interface ExportEvidenceItem {
  record_no: number;
  thumbnail_url: string;
  type: string;
  category_name: string;
  uploaded_at: string;
  address: string;
  user_name: string;
  remark: string;
}

export function generateEvidencePdf(items: ExportEvidenceItem[], filters: {
  categoryName?: string;
  dateFrom?: string;
  dateTo?: string;
}): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    bufferPages: true,
  });

  const fontPath = getFontPath();
  if (fontPath) {
    doc.registerFont('CJK', fontPath).font('CJK');
  } else {
    doc.font('Helvetica');
  }

  doc.fontSize(18).text('物业服务监督系统', { align: 'center' });
  doc.fontSize(10).text('证据清单', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(8).fillColor('#86868B').text([
    `导出时间: ${new Date().toLocaleString('zh-CN')}`,
    filters.categoryName ? `分类: ${filters.categoryName}` : '',
    filters.dateFrom ? `时间范围: ${filters.dateFrom} ~ ${filters.dateTo || '至今'}` : '',
    `共 ${items.length} 条记录`,
  ].filter(Boolean).join('  |  '), { align: 'center' });

  doc.moveDown(1);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidths = [40, 160, pageWidth - 380, 60, 80, 40];
  const headers = ['编号', '位置', '备注', '分类', '时间', '类型'];

  let y = doc.y;

  const drawHeader = () => {
    doc.fontSize(7).fillColor('#86868B');
    let x = doc.page.margins.left;
    headers.forEach((h, i) => {
      doc.text(h, x, y, { width: colWidths[i], align: 'left' });
      x += colWidths[i];
    });
    y += 14;
    doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.margins.left + pageWidth, y).stroke('#E5E5EA');
    y += 4;
  };

  drawHeader();

  for (const item of items) {
    if (y > doc.page.height - doc.page.margins.bottom - 40) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }

    doc.fontSize(8).fillColor('#1D1D1F');
    let x = doc.page.margins.left;
    const cols = [
      `NO.${item.record_no}`,
      item.address || '-',
      item.remark || '-',
      item.category_name || '-',
      item.uploaded_at || '-',
      item.type === 'video' ? '视频' : item.type === 'audio' ? '录音' : '图片',
    ];
    cols.forEach((c, i) => {
      doc.text(c, x, y, { width: colWidths[i], align: 'left' });
      x += colWidths[i];
    });
    y += 16;
  }

  doc.end();
  return doc;
}
