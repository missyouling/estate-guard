export function isValidIdCard(id: string): boolean {
  if (!/^\d{17}[\dXx]$/.test(id)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  const sum = id.slice(0, 17).split('').reduce((acc, d, i) => acc + +d * weights[i], 0);
  const checkCode = checkCodes[sum % 11];
  return checkCode === id[17].toUpperCase();
}

export function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}
