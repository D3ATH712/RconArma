import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Play, Square, Edit, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface BotInstanceCardProps {
  bot: {
    id: number;
    name: string;
    status: string;
    guildCount: number;
    lastActive: string;
  };
}

export function BotInstanceCard({ bot }: BotInstanceCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const startBotMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/bots/${bot.id}/start`),
    onSuccess: () => {
      toast({
        title: "Bot Started",
        description: `${bot.name} has been started successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Failed to start bot: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const stopBotMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/bots/${bot.id}/stop`),
    onSuccess: () => {
      toast({
        title: "Bot Stopped",
        description: `${bot.name} has been stopped.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: `Failed to stop bot: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-100 text-green-800';
      case 'restarting':
        return 'bg-yellow-100 text-yellow-800';
      case 'stopped':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    return status === 'online' ? '●' : status === 'restarting' ? '○' : '○';
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Avatar className="h-10 w-10">
              <AvatarFallback className={bot.status === 'online' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}>
                🤖
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="text-sm font-medium text-gray-900">{bot.name}</div>
              <div className="text-sm text-gray-500">bot-{bot.id}</div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <Badge className={getStatusColor(bot.status)}>
              <span className="mr-1.5">{getStatusIcon(bot.status)}</span>
              {bot.status.charAt(0).toUpperCase() + bot.status.slice(1)}
            </Badge>
            
            <div className="text-sm text-gray-900">{bot.guildCount}</div>
            
            <div className="text-sm text-gray-500">
              {bot.lastActive ? new Date(bot.lastActive).toLocaleString() : 'Never'}
            </div>

            <div className="flex space-x-2">
              <Button variant="ghost" size="sm">
                View
              </Button>
              <Button variant="ghost" size="sm">
                <Edit className="h-4 w-4" />
              </Button>
              {bot.status === 'stopped' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startBotMutation.mutate()}
                  disabled={startBotMutation.isPending}
                >
                  <Play className="h-4 w-4 text-green-600" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => stopBotMutation.mutate()}
                  disabled={stopBotMutation.isPending}
                >
                  <Square className="h-4 w-4 text-red-600" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
