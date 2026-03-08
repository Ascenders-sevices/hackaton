import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/format";
import { useNavigate } from "react-router-dom";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  CalendarDays, BedDouble, IndianRupee, Users, AlertTriangle, SprayCan,
  Bot, Brain, Zap, UserCheck, MessageCircleHeart, ShieldAlert, Loader2, Sparkles,
} from "lucide-react";

interface DashboardStats {
  totalRooms: number; occupiedRooms: number; totalBookings: number;
  monthlyRevenue: number; activeGuests: number; dirtyRooms: number;
  outstandingPayments: number;
  revenueByMonth: { month: string; revenue: number }[];
  occupancyTrend: { month: string; occupancy: number }[];
}

interface DashboardResponse {
  stats: {
    totalRooms: number;
    activeBookings: number;
    totalBookings: number;
    totalRevenue: number;
    outstandingPayments: number;
    dirtyRooms: number;
    totalGuests: number;
  };
  monthlyRevenue: { month: string; revenue: number }[];
  occupancyTrend: { month: string; occupancy: number }[];
}

interface Briefing {
  greeting: string;
  key_metrics: { occupancy: number; arrivals: number; departures: number; revenue_today: number };
  priority_actions: { priority: string; action: string; category: string }[];
  opportunities: string[];
  risks: string[];
  forecast_note: string;
}

const Dashboard = () => {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalRooms: 0, occupiedRooms: 0, totalBookings: 0, monthlyRevenue: 0,
    activeGuests: 0, dirtyRooms: 0, outstandingPayments: 0,
    revenueByMonth: [], occupancyTrend: [],
  });
  const [loading, setLoading] = useState(true);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    const fetchStats = async () => {
      try {
        const data = await api.get<DashboardResponse>("/api/dashboard/stats");
        const { stats: s, monthlyRevenue, occupancyTrend } = data;

        setStats({
          totalRooms: s.totalRooms, occupiedRooms: s.activeBookings,
          totalBookings: s.totalBookings,
          monthlyRevenue: monthlyRevenue?.[5]?.revenue ?? s.totalRevenue,
          activeGuests: s.activeBookings, dirtyRooms: s.dirtyRooms,
          outstandingPayments: s.outstandingPayments,
          revenueByMonth: monthlyRevenue || [],
          occupancyTrend: occupancyTrend || [],
        });
      } catch (err) {
        console.error("Dashboard stats error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [tenantId]);

  const loadBriefing = async () => {
    setBriefingLoading(true);
    try {
      const data = await api.ai<Briefing>("briefing");
      setBriefing(data);
    } catch { /* silent */ }
    finally { setBriefingLoading(false); }
  };

  const statCards = [
    { title: "Occupancy Rate", value: stats.totalRooms ? `${Math.round((stats.occupiedRooms / stats.totalRooms) * 100)}%` : "0%", description: `${stats.occupiedRooms} of ${stats.totalRooms} rooms`, icon: BedDouble },
    { title: "Total Bookings", value: stats.totalBookings.toString(), description: "Non-cancelled bookings", icon: CalendarDays },
    { title: "Monthly Revenue", value: formatCurrency(stats.monthlyRevenue), description: "This month", icon: IndianRupee },
    { title: "Active Guests", value: stats.activeGuests.toString(), description: "Currently checked in", icon: Users },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6"><div className="h-20 bg-muted rounded" /></CardContent></Card>)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">AI-powered property performance overview</p>
        </div>
        <Button onClick={loadBriefing} disabled={briefingLoading} variant="outline" className="gap-2">
          {briefingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-primary" />}
          Daily AI Briefing
        </Button>
      </div>

      {briefing && (
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-6">
            <p className="font-medium mb-3">{briefing.greeting}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-background"><p className="text-xs text-muted-foreground">Occupancy</p><p className="text-xl font-bold">{briefing.key_metrics.occupancy}%</p></div>
              <div className="p-3 rounded-lg bg-background"><p className="text-xs text-muted-foreground">Arrivals Today</p><p className="text-xl font-bold">{briefing.key_metrics.arrivals}</p></div>
              <div className="p-3 rounded-lg bg-background"><p className="text-xs text-muted-foreground">Departures</p><p className="text-xl font-bold">{briefing.key_metrics.departures}</p></div>
              <div className="p-3 rounded-lg bg-background"><p className="text-xs text-muted-foreground">Revenue Today</p><p className="text-xl font-bold">{formatCurrency(briefing.key_metrics.revenue_today)}</p></div>
            </div>
            {briefing.priority_actions.length > 0 && (
              <div className="space-y-2 mb-3">
                <p className="text-sm font-semibold">Priority Actions:</p>
                {briefing.priority_actions.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Badge variant={a.priority === "high" ? "destructive" : "secondary"} className="text-xs">{a.priority}</Badge>
                    <span>{a.action}</span>
                  </div>
                ))}
              </div>
            )}
            {briefing.forecast_note && <p className="text-sm text-muted-foreground italic mt-2">📊 {briefing.forecast_note}</p>}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <stat.icon className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Revenue Trend</CardTitle><CardDescription>Last 6 months</CardDescription></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stats.revenueByMonth}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(35, 92%, 50%)" fill="hsl(35, 92%, 50%)" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Occupancy Trend</CardTitle><CardDescription>Last 6 months</CardDescription></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.occupancyTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis unit="%" tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Bar dataKey="occupancy" fill="hsl(35, 92%, 50%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="w-5 h-5 text-primary" />AI Intelligence Suite</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { icon: Bot, label: "AI Copilot", desc: "Ask questions", path: "ai-copilot" },
              { icon: Brain, label: "Forecasting", desc: "Predict demand", path: "forecasting" },
              { icon: Zap, label: "Pricing", desc: "Optimize rates", path: "dynamic-pricing" },
              { icon: UserCheck, label: "Guest Intel", desc: "Loyalty & churn", path: "guest-intelligence" },
              { icon: MessageCircleHeart, label: "Sentiment", desc: "Analyze reviews", path: "sentiment" },
              { icon: ShieldAlert, label: "Risk", desc: "Predict no-shows", path: "booking-risk" },
            ].map(a => (
              <Button key={a.path} variant="outline" className="h-auto py-3 px-3 flex-col items-center gap-1" onClick={() => navigate(`/admin/${a.path}`)}>
                <a.icon className="w-5 h-5 text-primary" />
                <span className="text-xs font-medium">{a.label}</span>
                <span className="text-xs text-muted-foreground">{a.desc}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.outstandingPayments > 0 && (
          <Card className="border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[hsl(var(--warning))]/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-[hsl(var(--warning))]" />
              </div>
              <div><p className="font-semibold">Outstanding Payments</p><p className="text-2xl font-bold">{formatCurrency(stats.outstandingPayments)}</p></div>
            </CardContent>
          </Card>
        )}
        {stats.dirtyRooms > 0 && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-destructive/20 flex items-center justify-center">
                <SprayCan className="w-6 h-6 text-destructive" />
              </div>
              <div><p className="font-semibold">Rooms Need Cleaning</p><p className="text-2xl font-bold">{stats.dirtyRooms} rooms</p></div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
