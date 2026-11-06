/** 摘要以可注入的方式提供：测试用 Node 的 webcrypto，浏览器用 window.crypto.subtle */
export interface DigestFn {
  (algorithm: "SHA-256" | "SHA-384", bytes: Uint8Array): Promise<Uint8Array>;
}

export const webcryptoDigest: DigestFn = async (algorithm, bytes) => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("当前环境不支持 Web Crypto，无法生成完整性摘要");
  // 拷一份成独立的 ArrayBuffer：DOM 与 Node 对 BufferSource 的类型要求不完全一致
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const digest = await subtle.digest(algorithm, copy);
  return new Uint8Array(digest);
};

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  const g = globalThis as unknown as { btoa?: (s: string) => string; Buffer?: typeof Buffer };
  if (typeof g.btoa === "function") {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return g.btoa(binary);
  }
  if (g.Buffer) return g.Buffer.from(bytes).toString("base64");
  throw new Error("当前环境不支持 base64 编码");
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** CSP 内联脚本摘要：`sha256-<base64>` */
export async function cspHash(source: string, digest: DigestFn = webcryptoDigest): Promise<string> {
  const d = await digest("SHA-256", utf8(source));
  return `sha256-${toBase64(d)}`;
}

/** 子资源完整性：`sha384-<base64>` */
export async function sriHash(source: string, digest: DigestFn = webcryptoDigest): Promise<string> {
  const d = await digest("SHA-384", utf8(source));
  return `sha384-${toBase64(d)}`;
}

export async function sha256Hex(text: string, digest: DigestFn = webcryptoDigest): Promise<string> {
  return toHex(await digest("SHA-256", utf8(text)));
}
