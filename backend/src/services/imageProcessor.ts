import sharp from 'sharp';
import { renderWatermarkText } from './watermark';
import { getDb } from '../db';
import { configs } from '../db/schema';
import path from 'path';
import fs from 'fs';

interface ProcessOptions {
  recordNo: number;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  room_number?: string | null;
  user_name?: string | null;
  remark?: string | null;
  building?: string | null;
  unit?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  file_type?: string | null;
  category?: string | null;
  system_name?: string | null;
}

async function getImageConfig() {
  const db = getDb();
  const rows = await db.select().from(configs);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    maxWidth: parseInt(map.image_compress_max_width || '1920', 10),
    quality: parseInt(map.image_compress_quality || '80', 10),
    autoWatermark: map.watermark_auto_apply === 'true',
  };
}

export async function processImage(
  inputPath: string,
  outputDir: string,
  filename: string,
  options: ProcessOptions,
): Promise<{ width: number; height: number; sizeBytes: number; watermarkApplied: boolean }> {
  const cfg = await getImageConfig();
  const ext = path.extname(filename).toLowerCase();
  const baseName = path.basename(filename, ext);

  const outputFile = path.join(outputDir, `${baseName}.jpg`);
  const thumbFile = path.join(outputDir, '..', 'thumbnails', `${baseName}_thumb.jpg`);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.join(outputDir, '..', 'thumbnails'), { recursive: true });

  let pipeline = sharp(inputPath);
  const metadata = await pipeline.metadata();
  const origWidth = metadata.width || 800;
  const origHeight = metadata.height || 600;

  pipeline = pipeline
    .resize({ width: cfg.maxWidth, withoutEnlargement: true })
    .jpeg({ quality: cfg.quality, mozjpeg: true });

  const outWidth = Math.min(origWidth, cfg.maxWidth);
  const outHeight = Math.round(origHeight * (outWidth / origWidth));
  let watermarkApplied = false;

  if (cfg.autoWatermark) {
    try {
      const wm = await renderWatermarkText({
        record_no: options.recordNo,
        latitude: options.latitude,
        longitude: options.longitude,
        address: options.address,
        room_number: options.room_number,
        user_name: options.user_name,
        remark: options.remark,
        building: options.building,
        unit: options.unit,
        file_name: options.file_name,
        file_size: options.file_size,
        file_type: options.file_type,
        category: options.category,
        system_name: options.system_name,
      });

      const lines = wm.text.split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        const adaptiveSize = Math.max(13, Math.min(Math.round(outWidth / 38), 44));
        const fontSize = wm.fontSize > 0 ? Math.min(wm.fontSize, adaptiveSize) : adaptiveSize;
        const lineH = Math.round(fontSize * 1.5);
        const padX = Math.round(fontSize * 1.2);
        const padY = Math.round(fontSize * 1.0);
        const radius = Math.round(fontSize * 0.9);

        const maxLineChars = Math.max(...lines.map(l => l.length));
        const charWidth = fontSize * 0.6;
        const textBlockWidth = Math.min(maxLineChars * charWidth + padX * 2, outWidth * 0.92);

        const cardH = lines.length * lineH + padY * 2;

        const textElements = lines.map((line, i) => {
          const y = padY + (i + 0.8) * lineH;
          return `<text x="${padX}" y="${y}"
            font-family="Noto Sans CJK SC, sans-serif"
            font-size="${fontSize}"
            font-weight="${wm.fontWeight}"
            fill="${wm.textColor}"
            text-anchor="start">${escapeXml(line)}</text>`;
        }).join('\n');

        let svg: string;
        if (wm.showBg) {
          svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${textBlockWidth}" height="${cardH}">
            <defs>
              <linearGradient id="wmGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="rgba(0,0,0,${0.5 * wm.opacity})"/>
                <stop offset="100%" stop-color="rgba(0,0,0,${0.75 * wm.opacity})"/>
              </linearGradient>
              <filter id="wmShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.35)" flood-opacity="1"/>
              </filter>
            </defs>
            <rect x="0" y="0" width="${textBlockWidth}" height="${cardH}" rx="${radius}"
              fill="url(#wmGrad)" fill-opacity="${wm.opacity}"
              filter="url(#wmShadow)"
              stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
            ${textElements}
          </svg>`;
        } else {
          svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${textBlockWidth}" height="${cardH}">
            ${textElements}
          </svg>`;
        }

        const edgeMargin = Math.max(16, Math.round(fontSize * 0.8));
        const compositeOpts: any = { input: Buffer.from(svg) };
        if (wm.position === 'center') {
          compositeOpts.gravity = 'center';
        } else if (wm.position === 'southeast') {
          compositeOpts.top = outHeight - cardH - edgeMargin;
          compositeOpts.left = outWidth - textBlockWidth - edgeMargin;
        } else if (wm.position === 'southwest') {
          compositeOpts.top = outHeight - cardH - edgeMargin;
          compositeOpts.left = edgeMargin;
        } else if (wm.position === 'northeast') {
          compositeOpts.top = edgeMargin;
          compositeOpts.left = outWidth - textBlockWidth - edgeMargin;
        } else {
          compositeOpts.top = edgeMargin;
          compositeOpts.left = edgeMargin;
        }

        pipeline = pipeline.composite([compositeOpts]);
        watermarkApplied = true;
      }
    } catch (err: any) {
      console.error('[Watermark] Failed:', err.message?.slice(0, 200));
    }
  }

  await pipeline.toFile(outputFile);

  const finalMeta = await sharp(outputFile).metadata();

  await sharp(outputFile)
    .resize(400, 400, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .jpeg({ quality: 70 })
    .toFile(thumbFile);

  return {
    width: finalMeta.width || 0,
    height: finalMeta.height || 0,
    sizeBytes: finalMeta.size || 0,
    watermarkApplied,
  };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}