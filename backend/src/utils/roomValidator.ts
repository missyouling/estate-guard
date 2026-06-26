// 房号格式校验
// 合法格式:
//   含单元号: 栋号-单元号-层号-户号 (如 4-2-1-2) 或 栋号-单元号-层户号 (如 4-2-102)
//   无单元号: 栋号-层户号 (如 3-101)
// 仅允许数字与半角连接符 -

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
  if (parts.length < 2) return '房号格式不正确，请参考示例: 3-101 (无单元号) 或 4-2-102 (含单元号)';
  if (parts.length > 4) return '房号格式不正确，连接符过多';
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return `"${p}" 不是有效数字`;
  }
  return null;
}
