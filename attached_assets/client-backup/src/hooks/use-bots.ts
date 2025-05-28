import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useBots() {
  return useQuery({
    queryKey: ["/api/bots"],
  });
}

export function useBot(id: number) {
  return useQuery({
    queryKey: [`/api/bots/${id}`],
  });
}

export function useCreateBot() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (botData: { name: string; botToken: string }) =>
      apiRequest("POST", "/api/bots", botData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
    },
  });
}

export function useStartBot() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (botId: number) =>
      apiRequest("POST", `/api/bots/${botId}/start`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
    },
  });
}

export function useStopBot() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (botId: number) =>
      apiRequest("POST", `/api/bots/${botId}/stop`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
    },
  });
}

export function useBotStats() {
  return useQuery({
    queryKey: ["/api/stats"],
  });
}

export function useBotActivity(botId: number) {
  return useQuery({
    queryKey: [`/api/bots/${botId}/activity`],
  });
}
