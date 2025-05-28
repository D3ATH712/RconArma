import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { BotInstanceCard } from "@/components/bot-instance-card";
import { MigrationModal } from "@/components/migration-modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  Play, 
  Users, 
  Clock, 
  Terminal, 
  Plus, 
  Upload, 
  Book,
  CheckCircle,
  Settings,
  AlertTriangle,
  Info
} from "lucide-react";

export default function Dashboard() {
  const [showMigrationModal, setShowMigrationModal] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/stats"],
  });

  const { data: bots, isLoading: botsLoading } = useQuery({
    queryKey: ["/api/bots"],
  });

  const { data: recentActivity } = useQuery({
    queryKey: ["/api/bots/1/activity"],
  });

  const statsCards = [
    {
      title: "Active Bots",
      value: stats?.activeBots || 0,
      icon: Play,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Connected Guilds", 
      value: stats?.connectedGuilds || 0,
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Uptime",
      value: stats?.uptime || "99.9%",
      icon: Clock,
      color: "text-yellow-600", 
      bgColor: "bg-yellow-50",
    },
    {
      title: "Commands/Day",
      value: stats?.commandsPerDay || 0,
      icon: Terminal,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6">
          {/* Header Section */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Bot Dashboard</h1>
            <p className="text-gray-600 mt-1">Manage your Discord RCON bots and monitor their performance</p>
          </div>

          {/* Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {statsCards.map((stat, index) => (
              <Card key={index}>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className={`p-3 rounded-md ${stat.bgColor}`}>
                      <stat.icon className={`${stat.color} h-6 w-6`} />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {statsLoading ? "..." : stat.value}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick Actions */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button variant="outline" className="flex items-center justify-center">
                  <Plus className="mr-2 h-4 w-4" />
                  Deploy New Bot
                </Button>
                <Button 
                  variant="outline" 
                  className="flex items-center justify-center"
                  onClick={() => setShowMigrationModal(true)}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Migrate Existing
                </Button>
                <Button variant="outline" className="flex items-center justify-center">
                  <Book className="mr-2 h-4 w-4" />
                  View Documentation
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Bot Instances */}
          <Card className="mb-8">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Bot Instances</CardTitle>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Instance
              </Button>
            </CardHeader>
            <CardContent>
              {botsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
                  ))}
                </div>
              ) : bots && bots.length > 0 ? (
                <div className="space-y-4">
                  {bots.map((bot: any) => (
                    <BotInstanceCard key={bot.id} bot={bot} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">No bot instances found. Create your first bot to get started.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Migration Section */}
          <div className="mb-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold mb-2">Ready to migrate your existing bot?</h3>
                <p className="text-blue-100 mb-4">
                  Seamlessly transfer your Discord bot from local hosting to our cloud infrastructure with zero downtime.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="bg-white/20 text-white hover:bg-white/30">
                    <CheckCircle className="mr-1 h-3 w-3" />
                    PostgreSQL Migration
                  </Badge>
                  <Badge variant="secondary" className="bg-white/20 text-white hover:bg-white/30">
                    <CheckCircle className="mr-1 h-3 w-3" />
                    Auto-scaling
                  </Badge>
                  <Badge variant="secondary" className="bg-white/20 text-white hover:bg-white/30">
                    <CheckCircle className="mr-1 h-3 w-3" />
                    24/7 Monitoring
                  </Badge>
                </div>
              </div>
              <div className="flex-shrink-0">
                <Button 
                  className="bg-white text-blue-600 hover:bg-gray-100"
                  onClick={() => setShowMigrationModal(true)}
                >
                  Start Migration
                </Button>
              </div>
            </div>
          </div>

          {/* Recent Activity & Resource Usage */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivity && recentActivity.slice(0, 5).map((activity: any, index: number) => (
                    <div key={index} className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <div className="h-8 w-8 rounded-full bg-green-50 flex items-center justify-center">
                          {activity.action === 'bot_started' && <Play className="h-4 w-4 text-green-600" />}
                          {activity.action === 'player_banned' && <AlertTriangle className="h-4 w-4 text-red-600" />}
                          {activity.action === 'config_updated' && <Settings className="h-4 w-4 text-blue-600" />}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900">
                          {activity.action === 'bot_started' && `Bot "${activity.details?.botName}" started successfully`}
                          {activity.action === 'player_banned' && `Player "${activity.details?.player}" was banned`}
                          {activity.action === 'config_updated' && `Guild configuration updated`}
                        </p>
                        <p className="text-sm text-gray-500">
                          {new Date(activity.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )) || (
                    <div className="text-center text-gray-500 py-4">
                      No recent activity
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resource Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">CPU Usage</span>
                      <span className="text-sm text-gray-500">23%</span>
                    </div>
                    <Progress value={23} className="h-2" />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Memory Usage</span>
                      <span className="text-sm text-gray-500">45%</span>
                    </div>
                    <Progress value={45} className="h-2" />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Database Connections</span>
                      <span className="text-sm text-gray-500">12/50</span>
                    </div>
                    <Progress value={24} className="h-2" />
                  </div>

                  <Separator />

                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <Info className="h-4 w-4 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-600">All systems operating normally</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      <MigrationModal 
        open={showMigrationModal} 
        onOpenChange={setShowMigrationModal} 
      />
    </div>
  );
}
