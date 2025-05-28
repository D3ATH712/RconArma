import { guildConfigurations, activityLogs, type GuildConfiguration, type InsertGuildConfiguration, type InsertActivityLog } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  getGuildConfig(guildId: string): Promise<GuildConfiguration | undefined>;
  createGuildConfig(config: InsertGuildConfiguration): Promise<GuildConfiguration>;
  updateGuildConfig(guildId: string, config: Partial<InsertGuildConfiguration>): Promise<void>;
  logActivity(botInstanceId: number, guildId: string, action: string, details?: any): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getGuildConfig(guildId: string): Promise<GuildConfiguration | undefined> {
    const [config] = await db.select().from(guildConfigurations).where(eq(guildConfigurations.guildId, guildId));
    return config || undefined;
  }

  async createGuildConfig(config: InsertGuildConfiguration): Promise<GuildConfiguration> {
    const [guildConfig] = await db
      .insert(guildConfigurations)
      .values(config)
      .returning();
    return guildConfig;
  }

  async updateGuildConfig(guildId: string, config: Partial<InsertGuildConfiguration>): Promise<void> {
    await db
      .update(guildConfigurations)
      .set(config)
      .where(eq(guildConfigurations.guildId, guildId));
  }

  async logActivity(botInstanceId: number, guildId: string, action: string, details?: any): Promise<void> {
    await db
      .insert(activityLogs)
      .values({
        botInstanceId,
        guildId,
        action,
        details
      });
  }
}

export const storage = new DatabaseStorage();