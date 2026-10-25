import { createApp } from "./app";
import { env } from "./config/env";

const { httpServer, io, mqttService, store, irrigation, alertService } = createApp();

void (async () => {
  try {
    await store.initialize();
    await irrigation.initialize();
    await alertService.initialize();
  } catch (error) {
    console.error("Backend initialization failed", error);
    process.exit(1);
  }
  httpServer.listen(env.PORT, () => {
    console.log(`AgroSense API listening on http://localhost:${env.PORT}`);
  });
  httpServer.on("error", (error) => {
    console.error(`Failed to listen on port ${env.PORT} — is another backend already running?`, error.message);
    process.exit(1);
  });
  mqttService.start();
})();

const shutdown = () => {
  mqttService.stop();
  void Promise.all([store.close(), irrigation.close(), alertService.close()])
    .catch((error) => console.error("Shutdown error", error))
    .finally(() => {
      io.close();
      httpServer.close(() => process.exit(0));
    });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
