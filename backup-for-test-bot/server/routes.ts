import type { Express } from "express";
import { createServer, type Server } from "http";

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      service: "ARMA RCON Discord Bot"
    });
  });

  // Simple status endpoint
  app.get("/api/status", async (req, res) => {
    res.json({ 
      botStatus: "running",
      database: process.env.DATABASE_URL ? "connected" : "memory",
      uptime: process.uptime()
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
