import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, Send, Trash2 } from "lucide-react";

interface TerminalLine {
  id: number;
  command?: string;
  output: string;
  type: 'command' | 'output' | 'error';
  timestamp: Date;
}

export default function TerminalPage() {
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: 0,
      output: 'Welcome to the RCON Bot Terminal Interface',
      type: 'output',
      timestamp: new Date()
    },
    {
      id: 1,
      output: 'Type commands below to interact with your server.',
      type: 'output',
      timestamp: new Date()
    }
  ]);
  const [currentCommand, setCurrentCommand] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const executeCommand = async () => {
    if (!currentCommand.trim() || isLoading) return;

    const commandId = Date.now();
    const command = currentCommand.trim();
    
    // Add command to terminal
    setLines(prev => [...prev, {
      id: commandId,
      command,
      output: `$ ${command}`,
      type: 'command',
      timestamp: new Date()
    }]);

    setCurrentCommand('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/terminal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command }),
      });

      const result = await response.json();
      
      setLines(prev => [...prev, {
        id: commandId + 1,
        output: result.output || result.error || 'Command executed',
        type: response.ok ? 'output' : 'error',
        timestamp: new Date()
      }]);
    } catch (error) {
      setLines(prev => [...prev, {
        id: commandId + 1,
        output: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearTerminal = () => {
    setLines([{
      id: Date.now(),
      output: 'Terminal cleared',
      type: 'output',
      timestamp: new Date()
    }]);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Terminal className="h-6 w-6" />
          <h1 className="text-3xl font-bold">Terminal</h1>
        </div>
        <Button onClick={clearTerminal} variant="outline" size="sm">
          <Trash2 className="h-4 w-4 mr-2" />
          Clear
        </Button>
      </div>

      <Card className="bg-black text-green-400 font-mono">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-green-300">RCON Bot Terminal</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-96 w-full">
            <div ref={scrollRef} className="p-4 space-y-1">
              {lines.map((line) => (
                <div key={line.id} className="flex text-sm">
                  <span className="text-gray-500 mr-2 text-xs">
                    {formatTime(line.timestamp)}
                  </span>
                  <span className={`${
                    line.type === 'command' ? 'text-blue-400' :
                    line.type === 'error' ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {line.output}
                  </span>
                </div>
              ))}
              {isLoading && (
                <div className="flex text-sm">
                  <span className="text-gray-500 mr-2 text-xs">
                    {formatTime(new Date())}
                  </span>
                  <span className="text-yellow-400">Executing...</span>
                </div>
              )}
            </div>
          </ScrollArea>
          
          <div className="border-t border-gray-700 p-4">
            <div className="flex space-x-2">
              <span className="text-blue-400 self-center">$</span>
              <Input
                ref={inputRef}
                value={currentCommand}
                onChange={(e) => setCurrentCommand(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter command..."
                className="bg-transparent border-none text-green-400 focus:ring-0 focus:border-none"
                disabled={isLoading}
              />
              <Button 
                onClick={executeCommand} 
                disabled={!currentCommand.trim() || isLoading}
                size="sm"
                className="bg-green-600 hover:bg-green-700"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-2">Available Commands:</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <div><code className="bg-gray-100 px-2 py-1 rounded">ls</code> - List files</div>
            <div><code className="bg-gray-100 px-2 py-1 rounded">pwd</code> - Current directory</div>
            <div><code className="bg-gray-100 px-2 py-1 rounded">ps aux</code> - Running processes</div>
            <div><code className="bg-gray-100 px-2 py-1 rounded">df -h</code> - Disk usage</div>
            <div><code className="bg-gray-100 px-2 py-1 rounded">free -h</code> - Memory usage</div>
            <div><code className="bg-gray-100 px-2 py-1 rounded">uptime</code> - System uptime</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}