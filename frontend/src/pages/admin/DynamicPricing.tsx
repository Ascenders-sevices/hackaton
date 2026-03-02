import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { DollarSign, TrendingUp, TrendingDown, Loader2, Zap, ArrowRight, Lightbulb, Target } from "lucide-react";

interface PricingData {
  pricing_recommendations: {
    room_id: string;
    room_name: string;
    current_price: number;
    recommended_price: number;
    change_percentage: number;
    reason: string;
    confidence: number;
  }[];
  revenue_simulation: {
    current_monthly_estimate: number;
    optimized_monthly_estimate: number;
    potential_increase_percentage: number;
    assumptions: string;
  };
  pricing_strategy: {
    weekday_multiplier: number;
    weekend_multiplier: number;
    peak_season_multiplier: number;
    low_season_multiplier: number;
    last_minute_discount: number;
  };
  insights: string[];
}

const DynamicPricing = () => {
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const runPricingAnalysis = async () => {
    setLoading(true);
    try {
      const data = await api.ai<PricingData>("pricing");
      setPricing(data);
    } catch (e: any) {
      toast({ title: "Pricing Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const chartData = pricing?.pricing_recommendations.map(r => ({
    name: r.room_name,
    current: r.current_price,
    recommended: r.recommended_price,
    change: r.change_percentage,
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="w-7 h-7 text-primary" />
            Dynamic Pricing
          </h1>
          <p className="text-muted-foreground mt-1">AI-optimized room pricing with revenue simulation</p>
        </div>
        <Button onClick={runPricingAnalysis} disabled={loading} size="lg">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Target className="w-4 h-4 mr-2" />}
          {loading ? "Analyzing..." : "Optimize Pricing"}
        </Button>
      </div>

      {!pricing && !loading && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <DollarSign className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Pricing Analysis Yet</h3>
            <p className="text-muted-foreground text-sm text-center max-w-md mb-4">
              Click "Optimize Pricing" to get AI-powered pricing recommendations with revenue simulation for all your rooms.
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

      {pricing && (
        <>
          {/* Revenue Simulation */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Revenue Simulation
              </CardTitle>
              <CardDescription>{pricing.revenue_simulation.assumptions}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-8 flex-wrap">
                <div>
                  <p className="text-sm text-muted-foreground">Current Estimate</p>
                  <p className="text-2xl font-bold">{formatCurrency(pricing.revenue_simulation.current_monthly_estimate)}</p>
                  <p className="text-xs text-muted-foreground">/month</p>
                </div>
                <ArrowRight className="w-6 h-6 text-primary shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Optimized Estimate</p>
                  <p className="text-2xl font-bold text-[hsl(var(--success))]">{formatCurrency(pricing.revenue_simulation.optimized_monthly_estimate)}</p>
                  <p className="text-xs text-muted-foreground">/month</p>
                </div>
                <Badge className="text-lg px-4 py-1 bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]">
                  +{pricing.revenue_simulation.potential_increase_percentage}%
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Price Comparison Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Price Comparison</CardTitle>
              <CardDescription>Current vs AI-recommended pricing</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="current" fill="hsl(220, 14%, 80%)" name="Current Price" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="recommended" fill="hsl(35, 92%, 50%)" name="Recommended" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Individual Room Recommendations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pricing.pricing_recommendations.map((rec) => (
              <Card key={rec.room_id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">{rec.room_name}</h3>
                    <Badge variant={rec.change_percentage > 0 ? "default" : "secondary"} className="gap-1">
                      {rec.change_percentage > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {rec.change_percentage > 0 ? "+" : ""}{rec.change_percentage}%
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mb-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Current</p>
                      <p className="text-lg font-bold">{formatCurrency(rec.current_price)}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Recommended</p>
                      <p className="text-lg font-bold text-primary">{formatCurrency(rec.recommended_price)}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{rec.reason}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${rec.confidence * 100}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{Math.round(rec.confidence * 100)}% confidence</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Strategy & Insights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Target className="w-5 h-5 text-primary" />Pricing Strategy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Weekday Rate", value: `×${pricing.pricing_strategy.weekday_multiplier}` },
                  { label: "Weekend Rate", value: `×${pricing.pricing_strategy.weekend_multiplier}` },
                  { label: "Peak Season", value: `×${pricing.pricing_strategy.peak_season_multiplier}` },
                  { label: "Low Season", value: `×${pricing.pricing_strategy.low_season_multiplier}` },
                  { label: "Last-Minute Discount", value: `×${pricing.pricing_strategy.last_minute_discount}` },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                    <span className="text-sm">{s.label}</span>
                    <Badge variant="outline" className="font-mono">{s.value}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Lightbulb className="w-5 h-5 text-primary" />Pricing Insights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pricing.insights.map((insight, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted">
                    <span className="text-primary font-bold text-sm shrink-0">{i + 1}.</span>
                    <p className="text-sm">{insight}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default DynamicPricing;
