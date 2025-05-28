import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

export default function Configuration() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configuration</h1>
        <p className="text-muted-foreground">Configure your RconArma bot settings</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Bot Settings</CardTitle>
            <CardDescription>Configure basic bot behavior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="botName">Bot Name</Label>
                <Input id="botName" defaultValue="RconArma" />
              </div>
              <div>
                <Label htmlFor="commandPrefix">Command Prefix</Label>
                <Input id="commandPrefix" defaultValue="!" />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch id="enableLogging" defaultChecked />
              <Label htmlFor="enableLogging">Enable detailed logging</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>RCON Settings</CardTitle>
            <CardDescription>Configure RCON API connection</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="rconEndpoint">RCON API Endpoint</Label>
              <Input id="rconEndpoint" defaultValue="https://0grind.io/api" />
            </div>
            <div className="flex items-center space-x-2">
              <Switch id="enableRcon" defaultChecked />
              <Label htmlFor="enableRcon">Enable RCON commands</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>IP Monitoring</CardTitle>
            <CardDescription>Configure IP change monitoring and alerts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="checkInterval">Check Interval (hours)</Label>
              <Input id="checkInterval" type="number" defaultValue="1" />
            </div>
            <div className="flex items-center space-x-2">
              <Switch id="enableIPMonitoring" defaultChecked />
              <Label htmlFor="enableIPMonitoring">Enable IP monitoring</Label>
            </div>
          </CardContent>
        </Card>

        <Separator />

        <div className="flex justify-end space-x-2">
          <Button variant="outline">Reset to Defaults</Button>
          <Button>Save Configuration</Button>
        </div>
      </div>
    </div>
  );
}