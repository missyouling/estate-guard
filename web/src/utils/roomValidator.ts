export function isValidRoom(room: string): boolean {
  if (!room || typeof room !== 'string') return false;
  const parts = room.split('-');
  if (parts.length < 2 || parts.length > 4) return false;
  return parts.every(p => /^\d+$/.test(p));
}

export function getRoomErrorMessage(room: string): string | null {
  if (!room || !room.trim()) return '请输入房号';
  const trimmed = room.trim();
  if (/[^\d\-]/.test(trimmed)) return '房号仅允许数字和半角连接符(-)';
  const parts = trimmed.split('-');
  if (parts.length < 2) return '房号格式不正确，参考示例: 3-101 (无单元号) 或 4-2-102 (含单元号)';
  if (parts.length > 4) return '房号格式不正确，连接符过多';
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return `"${p}" 不是有效数字`;
  }
  return null;
}
