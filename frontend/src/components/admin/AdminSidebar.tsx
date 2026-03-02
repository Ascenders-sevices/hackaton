import {
  LayoutDashboard, CalendarDays, BedDouble, Users, Megaphone, BarChart3,
  Settings, MessageSquare, LogOut, Hexagon, Bot, Brain, Zap,
  UserCheck, MessageCircleHeart, ShieldAlert,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const mainNav = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Bookings", url: "/admin/bookings", icon: CalendarDays },
  { title: "Rooms", url: "/admin/rooms", icon: BedDouble },
  { title: "Guests", url: "/admin/guests", icon: Users },
];

const aiNav = [
  { title: "AI Copilot", url: "/admin/ai-copilot", icon: Bot },
  { title: "Forecasting", url: "/admin/forecasting", icon: Brain },
  { title: "Dynamic Pricing", url: "/admin/dynamic-pricing", icon: Zap },
  { title: "Guest Intelligence", url: "/admin/guest-intelligence", icon: UserCheck },
  { title: "Sentiment Analysis", url: "/admin/sentiment", icon: MessageCircleHeart },
  { title: "Booking Risk", url: "/admin/booking-risk", icon: ShieldAlert },
];

const marketingNav = [
  { title: "Marketing", url: "/admin/marketing", icon: Megaphone },
  { title: "Messaging", url: "/admin/messaging", icon: MessageSquare },
];

const systemNav = [
  { title: "Reports", url: "/admin/reports", icon: BarChart3 },
  { title: "Settings", url: "/admin/settings", icon: Settings },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, profile } = useAuth();

  const isActive = (path: string) =>
    path === "/admin" ? location.pathname === "/admin" : location.pathname.startsWith(path);

  const renderItems = (items: typeof mainNav) =>
    items.map((item) => (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild isActive={isActive(item.url)}>
          <NavLink to={item.url} end={item.url === "/admin"} className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
            <Hexagon className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="text-sm font-bold text-sidebar-foreground tracking-tight">AIR BEE</h2>
              <p className="text-xs text-sidebar-foreground/60 truncate max-w-[140px]">
                {profile?.full_name || "Property Manager"}
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>{renderItems(mainNav)}</SidebarMenu></SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>AI Intelligence</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>{renderItems(aiNav)}</SidebarMenu></SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Marketing</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>{renderItems(marketingNav)}</SidebarMenu></SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>{renderItems(systemNav)}</SidebarMenu></SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
