export interface BotInstance {
  id: number;
  userId: number;
  name: string;
  botToken: string;
  status: 'online' | 'offline' | 'restarting' | 'stopped';
  processId?: string;
  lastActive?: string;
  guildCount: number;
  commandsToday: number;
  createdAt: string;
  updatedAt: string;
}

export interface GuildConfiguration {
  id: number;
  botInstanceId: number;
  guildId: string;
  serverId: string;
  apiToken: string;
  banLogChannelId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLog {
  id: number;
  botInstanceId: number;
  guildId?: string;
  action: string;
  details?: any;
  timestamp: string;
}

export interface DashboardStats {
  activeBots: number;
  connectedGuilds: number;
  uptime: string;
  commandsPerDay: number;
}
