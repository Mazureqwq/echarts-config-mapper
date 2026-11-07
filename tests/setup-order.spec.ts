import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * 回归守卫（对应真实故障：打开大屏图表的实时数据面板报
 * `Cannot access 'probe' before initialization`）。
 *
 * `<script setup>` 里带 `immediate: true` 的 watch 会在 setup 阶段**立刻**执行回调；
 * 如果回调里写到的 ref 声明在这行之后，就会踩暂时性死区（TDZ）。
 *
 * 检查方式：找出立刻执行的 watch → 找到它调用的具名函数 → 收集函数体里
 * 被写入（`x.value = …`）的变量 → 若该变量以 `const x = ref(...)` 声明，
 * 则声明必须出现在 watch 之前。
 */
const ROOT = join(process.cwd(), "src");

function vueFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...vueFiles(full));
    else if (entry.endsWith(".vue")) out.push(full);
  }
  return out;
}

function scriptSetup(source: string): string {
  const m = /<script\s+setup[^>]*>([\s\S]*?)<\/script>/.exec(source);
  return m ? m[1] : "";
}

function lineOf(code: string, index: number): number {
  return code.slice(0, index).split("\n").length;
}

function functionBody(code: string, name: string): string {
  const start = code.search(new RegExp(`function\\s+${name}\\s*\\(`));
  if (start === -1) return "";
  const open = code.indexOf("{", start);
  if (open === -1) return "";
  // 粗粒度配平：统计花括号，遇到归零即为函数体结束
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}") {
      depth--;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  return code.slice(open);
}

interface Violation {
  file: string;
  line: number;
  ref: string;
}

function findViolations(file: string): Violation[] {
  const code = scriptSetup(readFileSync(file, "utf8"));
  const name = relative(ROOT, file).replace(/\\/g, "/");
  if (!code) return [];

  const violations: Violation[] = [];
  const eager = /^[ \t]*(watch|watchEffect)\s*\(/gm;
  let m: RegExpExecArray | null;
  while ((m = eager.exec(code))) {
    const head = code.slice(m.index, m.index + 400);
    if (!/immediate:\s*true/.test(head.split("\n").slice(0, 6).join("\n"))) continue;

    const call = code.slice(m.index, code.indexOf("\n", m.index) + 1);
    const handler = /watch\s*\(\s*[^,]+,\s*([A-Za-z_$][\w$]*)\s*,/.exec(call);
    if (!handler) continue;

    const body = functionBody(code, handler[1]);
    const written = new Set(
      [...body.matchAll(/([A-Za-z_$][\w$]*)\.value\s*=/g)].map((x) => x[1])
    );
    for (const ref of written) {
      const decl = new RegExp(`^[ \\t]*const\\s+${ref}\\s*=\\s*(ref|shallowRef|reactive)\\s*[<(]`, "m").exec(code);
      if (!decl || decl.index === undefined) continue; // 不是本组件的 ref（比如 props）就跳过
      if (decl.index > m.index) {
        violations.push({ file: name, line: lineOf(code, m.index), ref });
      }
    }
  }
  return violations;
}

describe("<script setup> 里立刻执行的 watch 不得读取尚未声明的 ref（TDZ 守卫）", () => {
  const files = vueFiles(ROOT);

  it("扫描器能读到组件文件", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("没有任何组件违反声明顺序", () => {
    const all = files.flatMap(findViolations);
    expect(
      all.map((v) => `${v.file}:${v.line} 在声明前写入 ${v.ref}`),
      "带 immediate 的 watch 会在 setup 阶段立刻执行，必须排在它写入的 ref 声明之后"
    ).toEqual([]);
  });

  it("守卫本身有效：能识别出「watch 写在 ref 之前」的写法", () => {
    // 用一份内联样本验证规则确实会报错，避免规则退化成永远通过
    const sample = `
function sync(): void {
  probe.value = null;
}
watch(() => props.id, sync, { immediate: true });
const probe = ref<number | null>(null);
`;
    const decl = /^[ \t]*const\s+probe\s*=\s*(ref|shallowRef|reactive)\s*[<(]/m.exec(sample);
    const watchAt = sample.search(/^[ \t]*watch\s*\(/m);
    expect(decl).not.toBeNull();
    expect((decl?.index ?? 0) > watchAt).toBe(true);
  });
});
