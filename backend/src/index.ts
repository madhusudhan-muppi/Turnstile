import "dotenv/config";
import { createHttpServer } from "./httpServer.js";

const PORT = Number(process.env.PORT) || 4000;

const { server } = createHttpServer();

server.listen(PORT, () => {
  console.log(`Turnstile backend listening on http://localhost:${PORT}`);
});
