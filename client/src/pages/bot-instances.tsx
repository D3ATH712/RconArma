import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";

export default function BotInstances() {
  const { data: bots = [], isLoading } = useQuery({
    queryKey: ['/api/bots']
  });

  const { data: stats = {} } = useQuery({
    queryKey: ['/api/stats']
  });

  if (isLoading) {
    return <div className="p-6">Loading bot instances...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bot Instances</h1>
        <p className="text-muted-foreground">Manage your RconArma bot instances</p>
      </div>

      <div className="grid gap-4">
        {bots.map((bot: any) => (
          <Card key={bot.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {bot.name}
                    <Badge variant={bot.status === 'online' ? 'default' : 'destructive'}>
                      {bot.status}
                    </Badge>
                  </CardTitle>
                  <CardDescription>Bot ID: {bot.id}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">Configure</Button>
                  <Button variant="outline" size="sm">View Logs</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Connected Guilds</p>
                  <p className="font-medium">{stats.connectedGuilds || 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Uptime</p>
                  <p className="font-medium">{stats.uptime || '0m'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Commands/Day</p>
                  <p className="font-medium">{bot.commandsToday || 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last Activity</p>
                  <p className="font-medium">{bot.lastActivity || 'Just now'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}