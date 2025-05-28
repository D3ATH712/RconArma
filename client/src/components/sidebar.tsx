import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { 
  BarChart3, 
  Bot, 
  Settings, 
  Database, 
  FileText, 
  CreditCard, 
  HelpCircle,
  LayoutDashboard
} from "lucide-react";

interface SidebarProps {
  className?: string;
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Bot Instances', href: '/bot-instances', icon: Bot },
  { name: 'Configuration', href: '/configuration', icon: Settings },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Database', href: '/database', icon: Database },
  { name: 'Logs', href: '/logs', icon: FileText },
  { name: 'Billing', href: '/billing', icon: CreditCard },
  { name: 'Support', href: '/support', icon: HelpCircle },
];

export function Sidebar({ className }: SidebarProps) {
  const [location] = useLocation();

  return (
    <div className={cn("w-64 bg-white shadow-sm h-screen sticky top-0 border-r border-gray-200", className)}>
      <div className="p-6">
        <nav className="space-y-2">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  isActive
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors'
                )}
              >
                <item.icon className="mr-3 h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
