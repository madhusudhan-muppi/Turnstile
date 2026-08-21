import http from "node:http";
import { createApp } from "./server.js";

export function createHttpServer() {
  const app = createApp();
  const server = http.createServer(app);
  return { app, server };
}
