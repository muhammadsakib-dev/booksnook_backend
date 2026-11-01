import app from "./app.js";
import { ENV } from "./config/env.js";
import { connectToMongoDB, closeMongoDB } from "./config/db.js";
import { runDatabaseMigrations } from "./services/migrationService.js";

async function startServer() {
  try {
    // 1. Connect to MongoDB
    const { db } = await connectToMongoDB();

    // 2. Non-blocking automated schema & index verification
    try {
      await runDatabaseMigrations(db);
    } catch (migErr) {
      console.warn("[STARTUP NOTICE] Database index check:", migErr.message);
    }

    // 3. Start Express server
    const server = app.listen(ENV.PORT, () => {
      console.log(`[SERVER] BookNook API running on http://localhost:${ENV.PORT}`);
      console.log(`[SERVER] Allowed CORS Origin: ${ENV.ALLOWED_ORIGIN}`);
    });

    // 4. Graceful Shutdown Handlers
    const shutdown = async (signal) => {
      console.log(`[SERVER] Received ${signal}. Closing gracefully...`);
      server.close(async () => {
        await closeMongoDB();
        console.log("[SERVER] Closed out remaining connections.");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    return server;
  } catch (err) {
    console.error("[SERVER FATAL] Failed to start server:", err);
    process.exit(1);
  }
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith("server.js") || process.argv[1]?.endsWith("index.js")) {
  startServer();
}

export { startServer };

