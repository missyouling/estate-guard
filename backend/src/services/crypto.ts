import crypto from 'crypto';
import { env } from '../env';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(env.ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32), 'utf-8');

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(encryptedText: string): string {
  const [ivHex, tagHex, dataHex] = encryptedText.split(':');
  if (!ivHex || !tagHex || !dataHex) return '';
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  try {
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf-8');
  } catch {
    return '';
  }
}

export function maskIdCard(idCard: string): string {
  if (idCard.length !== 18) return '****';
  return idCard.slice(0, 4) + '**********' + idCard.slice(-4);
}

export function maskPhone(phone: string): string {
  if (phone.length !== 11) return '****';
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}
