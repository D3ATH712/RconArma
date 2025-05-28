import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const guildConfigurations = pgTable("guild_configurations", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  serverId: text("server_id").notNull(),
  apiToken: text("api_token").notNull(),
  banLogChannelId: text("ban_log_channel_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGuildConfigurationSchema = createInsertSchema(guildConfigurations).pick({
  guildId: true,
  serverId: true,
  apiToken: true,
  banLogChannelId: true,
});

export type InsertGuildConfiguration = z.infer<typeof insertGuildConfigurationSchema>;
export type GuildConfiguration = typeof guildConfigurations.$inferSelect;

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  botInstanceId: integer("bot_instance_id").notNull(),
  guildId: text("guild_id").notNull(),
  action: text("action").notNull(),
  details: jsonb("details"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).pick({
  botInstanceId: true,
  guildId: true,
  action: true,
  details: true,
});

export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;
