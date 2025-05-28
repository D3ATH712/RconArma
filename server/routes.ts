import type { Express } from "express";
import { createServer, type Server } from "http";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

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

  // Terminal endpoint for shell commands
  app.post("/api/terminal", async (req, res) => {
    const { command } = req.body;
    
    if (!command || typeof command !== 'string') {
      return res.status(400).json({ error: 'Command is required' });
    }

    // Sanitize and limit commands for security
    const allowedCommands = ['ls', 'pwd', 'ps', 'df', 'free', 'uptime', 'whoami', 'date', 'uname'];
    const baseCommand = command.split(' ')[0];
    
    if (!allowedCommands.includes(baseCommand)) {
      return res.status(403).json({ 
        error: `Command '${baseCommand}' not allowed. Allowed commands: ${allowedCommands.join(', ')}` 
      });
    }

    try {
      const { stdout, stderr } = await execAsync(command, { 
        timeout: 10000,
        maxBuffer: 1024 * 1024 // 1MB limit
      });
      
      res.json({ 
        output: stdout || stderr || 'Command executed successfully',
        command 
      });
    } catch (error: any) {
      res.status(500).json({ 
        error: error.message || 'Command execution failed',
        command 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
