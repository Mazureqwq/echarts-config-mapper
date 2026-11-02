import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { isAllowedSavePath } from "./savePathGuard";

interface SaveBody {
  path?: string;
  content?: string;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => {
      data += chunk.toString("utf8");
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/** 读取并解析 JSON body（请求流只能消费一次，必须读一遍）；失败返回 null */
async function readJsonBody(req: IncomingMessage): Promise<SaveBody | null> {
  try {
    return JSON.parse(await readBody(req)) as SaveBody;
  } catch {
    return null;
  }
}

/** dev 保存/删除 API 中间件：白名单路径校验防穿越，仅限本地开发使用 */
export function saveApiPlugin(): Plugin {
  return {
    name: "cf-save-api",
    apply: "serve",
    configureServer(server) {
      const root = server.config.root;

      server.middlewares.use("/api/save", (req, res) => {
        void (async () => {
          const body = await readJsonBody(req);
          if (!body || typeof body.path !== "string" || !isAllowedSavePath(body.path)) {
            sendJson(res, 400, { ok: false, error: "path not allowed" });
            return;
          }
          let obj: unknown;
          try {
            obj = JSON.parse(body.content ?? "");
          } catch {
            sendJson(res, 400, { ok: false, error: "content is not valid json" });
            return;
          }
          const target = resolve(root, body.path);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, JSON.stringify(obj, null, 2) + "\n", "utf8");
          sendJson(res, 200, { ok: true });
        })().catch(() => sendJson(res, 500, { ok: false, error: "write failed" }));
      });

      server.middlewares.use("/api/delete", (req, res) => {
        void (async () => {
          const body = await readJsonBody(req);
          if (!body || typeof body.path !== "string" || !isAllowedSavePath(body.path)) {
            sendJson(res, 400, { ok: false, error: "path not allowed" });
            return;
          }
          await rm(resolve(root, body.path), { force: true });
          sendJson(res, 200, { ok: true });
        })().catch(() => sendJson(res, 500, { ok: false, error: "delete failed" }));
      });
    },
  };
}
