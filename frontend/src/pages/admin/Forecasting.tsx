import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from "recharts";
import { TrendingUp, Brain, Loader2, AlertTriangle, CalendarDays, Lightbulb, BarChart3 } from "lucide-react";

interface Forecast {
  monthly_forecast: { month: string; predicted_occupancy: number; predicted_revenue: number; confidence: number }[];
  demand_signals: { signal: string; impact: string }[];
  recommendations: string[];
  seasonal_patterns: { peak_months: string[]; low_months: string[]; avg_stay_duration: number };
}

const Forecasting = () => {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const runForecast = async () => {
    setLoading(true);
    try {
      const data = await api.ai<Forecast>("forecast");
      setForecast(data);
    } catch (e: any) {
      toast({ title: "Forecast Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="w-7 h-7 text-primary" />
            Demand Forecasting
          </h1>
          <p className="text-muted-foreground mt-1">AI-powered occupancy and revenue predictions</p>
        </div>
        <Button onClick={runForecast} disabled={loading} size="lg">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <TrendingUp className="w-4 h-4 mr-2" />}
          {loading ? "Analyzing..." : "Run Forecast"}
        </Button>
      </div>

      {!forecast && !loading && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BarChart3 className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Forecast Generated Yet</h3>
            <p className="text-muted-foreground text-sm text-center max-w-md mb-4">
              Click "Run Forecast" to analyze your booking data and generate AI-powered demand predictions for the next 6 months.
            </p>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => (
            <Card key={i} className="animate-pulse"><CardContent className="p-6"><div className="h-40 bg-muted rounded" /></CardContent></Card>
          ))}
        </div>
      )}

      {forecast && (
        <>
          {/* Occupancy Forecast Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary" />Occupancy Forecast</CardTitle>
              <CardDescription>Predicted occupancy rates for the next 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={forecast.monthly_forecast}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis unit="%" className="text-xs" />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Area type="monotone" dataKey="predicted_occupancy" stroke="hsl(35, 92%, 50%)" fill="hsl(35, 92%, 50%)" fillOpacity={0.2} name="Occupancy %" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Revenue Forecast Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" />Revenue Forecast</CardTitle>
              <CardDescription>Projected monthly revenue</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={forecast.monthly_forecast}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="predicted_revenue" fill="hsl(35, 92%, 50%)" radius={[6, 6, 0, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Demand Signals */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-[hsl(var(--warning))]" />Demand Signals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {forecast.demand_signals.map((s, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted">
                    <Badge variant={s.impact === "high" ? "destructive" : "secondary"} className="shrink-0 mt-0.5">{s.impact}</Badge>
                    <p className="text-sm">{s.signal}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Lightbulb className="w-5 h-5 text-primary" />AI Recommendations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {forecast.recommendations.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted">
                    <span className="text-primary font-bold text-sm shrink-0">{i + 1}.</span>
                    <p className="text-sm">{r}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Seasonal Patterns */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CalendarDays className="w-5 h-5 text-primary" />Seasonal Patterns</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-[hsl(var(--success))]/10">
                    <p className="text-sm font-medium text-[hsl(var(--success))]">Peak Months</p>
                    <p className="text-lg font-bold mt-1">{forecast.seasonal_patterns.peak_months.join(", ")}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-destructive/10">
                    <p className="text-sm font-medium text-destructive">Low Months</p>
                    <p className="text-lg font-bold mt-1">{forecast.seasonal_patterns.low_months.join(", ")}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-primary/10">
                    <p className="text-sm font-medium text-primary">Avg Stay Duration</p>
                    <p className="text-lg font-bold mt-1">{forecast.seasonal_patterns.avg_stay_duration} nights</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default Forecasting;
