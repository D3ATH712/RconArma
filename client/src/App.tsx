import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import BotInstances from "@/pages/bot-instances";
import Configuration from "@/pages/configuration";
import Analytics from "@/pages/analytics";
import DatabasePage from "@/pages/database";
import Logs from "@/pages/logs";
import Terminal from "@/pages/terminal";
import Billing from "@/pages/billing";
import Support from "@/pages/support";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/bot-instances" component={BotInstances} />
      <Route path="/configuration" component={Configuration} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/database" component={DatabasePage} />
      <Route path="/logs" component={Logs} />
      <Route path="/terminal" component={Terminal} />
      <Route path="/billing" component={Billing} />
      <Route path="/support" component={Support} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
