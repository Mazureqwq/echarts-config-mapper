import type { Server } from "node:http";

export interface MockEndpoint {
  method: "GET" | "POST";
  path: string;
  summary: string;
  params: string[];
  chart: string | null;
}

export declare const DEMO_TOKEN: string;
export declare const DEFAULT_PORT: number;
export declare const ENDPOINTS: MockEndpoint[];
export declare function createMockServer(options?: { log?: boolean }): Server;
