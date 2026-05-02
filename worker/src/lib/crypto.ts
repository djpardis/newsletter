export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(digest);
}

export function bufferToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomTokenHex(bytes: number = 32): string {
  const u = new Uint8Array(bytes);
  crypto.getRandomValues(u);
  return bufferToHex(u.buffer);
}

export function uuid(): string {
  return crypto.randomUUID();
}
