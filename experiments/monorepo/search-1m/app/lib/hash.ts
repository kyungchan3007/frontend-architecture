export function hashId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = ((h * 33) ^ id.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function coverFor(id: string): string {
  const n = (hashId(id) % 20) + 1;
  return `/covers/cover-${String(n).padStart(2, "0")}.jpg`;
}
