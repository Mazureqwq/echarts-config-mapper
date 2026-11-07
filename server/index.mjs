#!/usr/bin/env node
/**
 * 启动 ChartForge 测试接口服务：
 *   pnpm server           # 默认 http://localhost:8787
 *   PORT=9000 pnpm server # 换端口（Windows PowerShell: $env:PORT=9000; pnpm server）
 */
import { createMockServer, DEFAULT_PORT } from "./app.mjs";

const port = Number(process.env.PORT) || DEFAULT_PORT;
const host = process.env.HOST || "0.0.0.0";

const server = createMockServer({ log: true });

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`[mock] 端口 ${port} 已被占用，换一个：PORT=9000 pnpm server`);
    process.exit(1);
  }
  console.error("[mock] 启动失败：", err);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log("");
  console.log("  ChartForge 测试接口已启动");
  console.log(`  接口目录：http://localhost:${port}/`);
  console.log(`  探活地址：http://localhost:${port}/health`);
  console.log(`  设置页 baseUrl 填： http://localhost:${port}`);
  console.log(`  鉴权接口令牌：Authorization=Bearer demo-token`);
  console.log("  按 Ctrl+C 停止");
  console.log("");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log("\n[mock] 已停止");
    server.close(() => process.exit(0));
  });
}
