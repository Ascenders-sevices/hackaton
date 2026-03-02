import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { UserCheck, Loader2, Star, TrendingDown, TrendingUp, Users, Crown, AlertTriangle, Lightbulb } from "lucide-react";

interface GuestIntelData {
  guest_scores: { name: string; email: string; loyalty_score: number; lifetime_value: number; total_stays: number; avg_spend: number; churn_risk: string; preferences: string[]; segment: string }[];
  segments: { name: string; count: number; avg_ltv: number; description: string }[];
  insights: string[];
  recommendations: string[];
}

const COLORS = ["hsl(35, 92%, 50%)", "hsl(142, 76%, 36%)", "hsl(220, 14%, 60%)", "hsl(0, 84%, 60%)", "hsl(280, 60%, 50%)"];

const GuestIntelligence = () => {
  const [data, setData] = useState<GuestIntelData | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const analyze = async () => {
    setLoading(true);
    try {
      const result = await api.ai<GuestIntelData>("guest-intelligence");
      setData(result);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const pieData = data?.segments.map(s => ({ name: s.name, value: s.count })) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <UserCheck className="w-7 h-7 text-primary" /> Guest Intelligence
          </h1>
          <p className="text-muted-foreground mt-1">AI-powered guest loyalty scoring, segmentation & churn prediction</p>
        </div>
        <Button onClick={analyze} disabled={loading} size="lg">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserCheck className="w-4 h-4 mr-2" />}
          {loading ? "Analyzing..." : "Analyze Guests"}
        </Button>
      </div>

      {!data && !loading && (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-16">
          <Users className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Analysis Yet</h3>
          <p className="text-muted-foreground text-sm text-center max-w-md">Click "Analyze Guests" to generate AI-powered loyalty scores, churn predictions, and guest segmentation.</p>
        </CardContent></Card>
      )}

      {loading && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1,2,3,4].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6"><div className="h-40 bg-muted rounded" /></CardContent></Card>)}</div>}

      {data && (
        <>
          {/* Segments Pie Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Guest Segments</CardTitle><CardDescription>AI-identified guest categories</CardDescription></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Segment Details</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.segments.map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <div>
                        <p className="font-medium text-sm">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm">{s.count} guests</p>
                      <p className="text-xs text-muted-foreground">Avg LTV: {formatCurrency(s.avg_ltv)}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Guest Scores Table */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Crown className="w-5 h-5 text-primary" />Guest Loyalty Scores</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.guest_scores.slice(0, 10).map((g, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 rounded-lg border">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="font-bold text-primary text-sm">{g.loyalty_score}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{g.name}</p>
                        <Badge variant="outline" className="text-xs">{g.segment}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{g.total_stays} stays • Avg {formatCurrency(g.avg_spend)} • LTV {formatCurrency(g.lifetime_value)}</p>
                    </div>
                    <Badge variant={g.churn_risk === "high" ? "destructive" : g.churn_risk === "medium" ? "secondary" : "default"} className="gap-1">
                      {g.churn_risk === "high" ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                      {g.churn_risk} risk
                    </Badge>
                    <div className="flex gap-1 flex-wrap max-w-[200px]">
                      {g.preferences.slice(0, 3).map((p, j) => <Badge key={j} variant="outline" className="text-xs">{p}</Badge>)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Insights & Recommendations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-[hsl(var(--warning))]" />Insights</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.insights.map((r, i) => <div key={i} className="p-3 rounded-lg bg-muted text-sm">{r}</div>)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="w-5 h-5 text-primary" />Recommendations</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.recommendations.map((r, i) => <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted"><span className="text-primary font-bold text-sm">{i+1}.</span><p className="text-sm">{r}</p></div>)}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default GuestIntelligence;
