import axios from 'axios';
import { Client } from 'discord.js';

interface IPMonitorConfig {
  currentIP: string;
  lastChecked: string;
  alertChannels: string[]; // Channel IDs to send alerts to
}

class IPMonitor {
  private config: IPMonitorConfig;
  private client: Client | null = null;
  private monitorInterval: NodeJS.Timeout | null = null;
  private readonly configPath: string;

  constructor() {
    this.configPath = 'server/ip-monitor-config.json';
    this.config = {
      currentIP: '',
      lastChecked: '',
      alertChannels: []
    };
    this.initConfig();
  }

  private async initConfig(): Promise<void> {
    this.config = await this.loadConfig();
  }

  private async loadConfig(): Promise<IPMonitorConfig> {
    try {
      const fs = await import('fs');
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading IP monitor config:', error);
    }
    
    // Default config
    return {
      currentIP: '',
      lastChecked: '',
      alertChannels: []
    };
  }

  private async saveConfig(): Promise<void> {
    try {
      const fs = await import('fs');
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Error saving IP monitor config:', error);
    }
  }

  setDiscordClient(client: Client): void {
    this.client = client;
  }

  addAlertChannel(channelId: string): void {
    if (!this.config.alertChannels.includes(channelId)) {
      this.config.alertChannels.push(channelId);
      this.saveConfig().catch(console.error);
      console.log(`✅ Added IP alert channel: ${channelId}`);
    }
  }

  removeAlertChannel(channelId: string): void {
    this.config.alertChannels = this.config.alertChannels.filter(id => id !== channelId);
    this.saveConfig().catch(console.error);
    console.log(`❌ Removed IP alert channel: ${channelId}`);
  }

  async getCurrentIP(): Promise<string> {
    try {
      const response = await axios.get('https://api.ipify.org?format=json', {
        timeout: 10000,
        responseType: 'json'
      });
      return response.data.ip;
    } catch (error) {
      console.error('Failed to get current IP:', error);
      throw new Error('Unable to fetch current IP address');
    }
  }

  async checkForIPChange(): Promise<void> {
    try {
      console.log('🔍 Checking for IP changes...');
      
      const currentIP = await this.getCurrentIP();
      const previousIP = this.config.currentIP;
      
      this.config.lastChecked = new Date().toISOString();
      
      if (previousIP && currentIP !== previousIP) {
        console.log(`🚨 IP CHANGE DETECTED! ${previousIP} → ${currentIP}`);
        await this.sendIPChangeAlert(previousIP, currentIP);
      } else if (!previousIP) {
        console.log(`📝 Initial IP recorded: ${currentIP}`);
      } else {
        console.log(`✅ IP unchanged: ${currentIP}`);
      }
      
      this.config.currentIP = currentIP;
      await this.saveConfig();
      
    } catch (error) {
      console.error('Error during IP check:', error);
    }
  }

  private async sendIPChangeAlert(oldIP: string, newIP: string): Promise<void> {
    if (!this.client || this.config.alertChannels.length === 0) {
      console.log('⚠️ No Discord client or alert channels configured');
      return;
    }

    const alertMessage = `🚨 **REPLIT IP ADDRESS CHANGED!**\n\n` +
      `**Old IP:** \`${oldIP}\`\n` +
      `**New IP:** \`${newIP}\`\n\n` +
      `⚠️ **ACTION REQUIRED:** Update your 0grind.io dashboard whitelist immediately!\n` +
      `🔧 Use \`!checkip\` to verify the current IP anytime.\n\n` +
      `🕒 Detected at: ${new Date().toLocaleString()}`;

    for (const channelId of this.config.alertChannels) {
      try {
        const channel = await this.client.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
          await channel.send(alertMessage);
          console.log(`📨 IP change alert sent to channel: ${channelId}`);
        }
      } catch (error) {
        console.error(`Failed to send alert to channel ${channelId}:`, error);
      }
    }
  }

  startMonitoring(intervalHours: number = 1): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    // Run initial check
    this.checkForIPChange();

    // Set up periodic monitoring
    const intervalMs = intervalHours * 60 * 60 * 1000;
    this.monitorInterval = setInterval(() => {
      this.checkForIPChange();
    }, intervalMs);

    console.log(`🕐 IP monitoring started - checking every ${intervalHours} hour(s)`);
  }

  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      console.log('⏹️ IP monitoring stopped');
    }
  }

  getStatus(): object {
    return {
      currentIP: this.config.currentIP,
      lastChecked: this.config.lastChecked,
      alertChannelsCount: this.config.alertChannels.length,
      isMonitoring: this.monitorInterval !== null
    };
  }
}

export const ipMonitor = new IPMonitor();