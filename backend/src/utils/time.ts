export function beijingTime(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' ');
}

export function beijingDate(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 10);
}

export function beijingISO(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T') + '.000Z';
}
