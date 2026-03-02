import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ShieldAlert, Loader2, AlertTriangle, Lightbulb, Calendar, TrendingDown, TrendingUp } from "lucide-react";

interface BookingRiskData {
  booking_risks: { booking_id: string; guest_name: string; check_in: string; room_name: string; risk_level: string; no_show_probability: number; cancellation_probability: number; risk_factors: string[]; recommended_action: string }[];
  overbooking_alerts: { date: string; rooms_booked: number; total_rooms: number; risk: string }[];
  summary: { total_upcoming: number; high_risk: number; medium_risk: number; low_risk: number; estimated_no_show_rate: number; total_revenue_at_risk: number };
  recommendations: string[];
}

const COLORS = ["hsl(0, 84%, 60%)", "hsl(38, 92%, 50%)", "hsl(142, 76%, 36%)"];

const BookingRisk = () => {
  const [data, setData] = useState<BookingRiskData | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const analyze = async () => {
    setLoading(true);
    try {
      const result = await api.ai<BookingRiskData>("booking-risk");
      setData(result);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const pieData = data ? [
    { name: "High Risk", value: data.summary.high_risk },
    { name: "Medium Risk", value: data.summary.medium_risk },
    { name: "Low Risk", value: data.summary.low_risk },
  ] : [];

  const riskColor = (level: string) => level === "high" ? "destructive" : level === "medium" ? "secondary" : "default";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-7 h-7 text-primary" /> Booking Risk Prediction
          </h1>
          <p className="text-muted-foreground mt-1">AI-powered no-show, cancellation & overbooking risk analysis</p>
        </div>
        <Button onClick={analyze} disabled={loading} size="lg">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldAlert className="w-4 h-4 mr-2" />}
          {loading ? "Analyzing..." : "Analyze Risks"}
        </Button>
      </div>

      {!data && !loading && (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-16">
          <ShieldAlert className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Risk Analysis Yet</h3>
          <p className="text-muted-foreground text-sm text-center max-w-md">Click "Analyze Risks" to predict no-shows, cancellations, and overbooking risks for upcoming bookings.</p>
        </CardContent></Card>
      )}

      {loading && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1,2,3,4].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6"><div className="h-40 bg-muted rounded" /></CardContent></Card>)}</div>}

      {data && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card><CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">Upcoming</p>
              <p className="text-3xl font-bold">{data.summary.total_upcoming}</p>
            </CardContent></Card>
            <Card className="border-destructive/30"><CardContent className="p-6 text-center">
              <p className="text-sm text-destructive">High Risk</p>
              <p className="text-3xl font-bold text-destructive">{data.summary.high_risk}</p>
            </CardContent></Card>
            <Card><CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">No-Show Rate</p>
              <p className="text-3xl font-bold">{data.summary.estimated_no_show_rate}%</p>
            </CardContent></Card>
            <Card className="border-[hsl(var(--warning))]/30"><CardContent className="p-6 text-center">
              <p className="text-sm text-[hsl(var(--warning))]">Revenue at Risk</p>
              <p className="text-3xl font-bold">{formatCurrency(data.summary.total_revenue_at_risk)}</p>
            </CardContent></Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Risk Distribution */}
            <Card>
              <CardHeader><CardTitle>Risk Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Overbooking Alerts */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5 text-[hsl(var(--warning))]" />Overbooking Alerts</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.overbooking_alerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3">No overbooking risks detected ✓</p>
                ) : data.overbooking_alerts.map((a, i) => (
                  <div key={i} className="p-3 rounded-lg bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/30">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{a.date}</span>
                      <Badge variant="destructive">{a.rooms_booked}/{a.total_rooms} rooms</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{a.risk}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Booking Risk Details */}
          <Card>
            <CardHeader><CardTitle>Booking Risk Details</CardTitle><CardDescription>Individual booking risk assessment</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {data.booking_risks.map((r, i) => (
                <div key={i} className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.guest_name}</span>
                      <Badge variant="outline" className="text-xs">{r.room_name}</Badge>
                      <span className="text-xs text-muted-foreground">{r.check_in}</span>
                    </div>
                    <Badge variant={riskColor(r.risk_level)} className="gap-1">
                      {r.risk_level === "high" ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                      {r.risk_level} risk
                    </Badge>
                  </div>
                  <div className="flex gap-4 mb-2 text-sm">
                    <span>No-show: <strong>{(r.no_show_probability * 100).toFixed(0)}%</strong></span>
                    <span>Cancel: <strong>{(r.cancellation_probability * 100).toFixed(0)}%</strong></span>
                  </div>
                  <div className="flex gap-1 flex-wrap mb-2">
                    {r.risk_factors.map((f, j) => <Badge key={j} variant="outline" className="text-xs">{f}</Badge>)}
                  </div>
                  <p className="text-xs text-primary font-medium">→ {r.recommended_action}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="w-5 h-5 text-primary" />Recommendations</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data.recommendations.map((r, i) => <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted"><span className="text-primary font-bold text-sm">{i+1}.</span><p className="text-sm">{r}</p></div>)}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default BookingRisk;
