import { getDb } from '../db';
import { configs } from '../db/schema';
import dayjs from 'dayjs';

function formatFileSize(bytes: number): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function beijingNowFormatted(format: string): string {
  const now = new Date();
  const bj = new Date(now.getTime() + (8 * 60 - now.getTimezoneOffset()) * 60000);
  return dayjs(bj).format(format);
}

export async function renderWatermarkText(vars: {
  record_no: number;
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
}): Promise<{ text: string; position: string; showBg: boolean; textColor: string; fontWeight: string; fontSize: number; opacity: number }> {
  const db = getDb();
  const rows = await db.select().from(configs);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  const template = map.watermark_template || 'NO.{record_no}\n{room} {user}\n{datetime}\n{location}\n{remark}';
  const dateFormat = map.watermark_date_format || 'YYYY-MM-DD HH:mm:ss';
  const recordPrefix = map.watermark_record_prefix || 'NO.';
  const recordDigits = parseInt(map.watermark_record_digits || '0', 10);
  const recordSuffix = map.watermark_record_suffix || '';

  const formattedDatetime = beijingNowFormatted(dateFormat);

  let recordStr = String(vars.record_no);
  if (recordDigits > 0) {
    recordStr = recordStr.padStart(recordDigits, '0');
  }
  const formattedRecordNo = `${recordPrefix}${recordStr}${recordSuffix}`;

  let location = vars.address || '';
  if (!location && vars.latitude && vars.longitude) {
    location = `GPS:${vars.latitude.toFixed(4)},${vars.longitude.toFixed(4)}`;
  }

  const building = vars.building || '';
  const unit = vars.unit || '';

  const text = template
    .replace(/\{record_no\}/g, formattedRecordNo)
    .replace(/\{datetime\}/g, formattedDatetime)
    .replace(/\{location\}/g, location || '')
    .replace(/\{room\}/g, vars.room_number ? `${vars.room_number}` : '')
    .replace(/\{user\}/g, vars.user_name || '')
    .replace(/\{remark\}/g, vars.remark || '')
    .replace(/\{building\}/g, building)
    .replace(/\{unit\}/g, unit)
    .replace(/\{file_name\}/g, vars.file_name || '')
    .replace(/\{file_size\}/g, formatFileSize(vars.file_size || 0))
    .replace(/\{file_type\}/g, vars.file_type || '')
    .replace(/\{category\}/g, vars.category || '')
    .replace(/\{address\}/g, location || '')
    .replace(/\{system_name\}/g, vars.system_name || '')
    .replace(/\\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');

  return {
    text,
    position: map.watermark_position || 'southwest',
    showBg: map.watermark_show_bg !== 'false',
    textColor: map.watermark_text_color || '#FFFFFF',
    fontWeight: map.watermark_font_weight === 'bold' ? 'bold' : 'normal',
    fontSize: parseInt(map.watermark_font_size || '14', 10),
    opacity: parseFloat(map.watermark_opacity || '0.8'),
  };
}
