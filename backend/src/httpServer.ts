import http from "node:http";
import { createApp } from "./server.js";
import { initRealtime } from "./realtime.js";

export function createHttpServer() {
  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server);
  return { app, server };
}
