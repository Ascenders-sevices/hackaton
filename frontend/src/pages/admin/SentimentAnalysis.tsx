import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { MessageCircleHeart, Loader2, ThumbsUp, ThumbsDown, Minus, AlertTriangle, Lightbulb, Plus, Trash2 } from "lucide-react";

interface SentimentData {
  reviews_analysis: { text: string; guest_name: string; sentiment: string; score: number; topics: string[]; flagged_issues: string[]; key_phrases: string[] }[];
  overall_sentiment: { score: number; label: string; positive_pct: number; neutral_pct: number; negative_pct: number };
  topic_breakdown: { topic: string; sentiment_score: number; mention_count: number }[];
  critical_alerts: string[];
  improvement_suggestions: string[];
}

const COLORS = ["hsl(142, 76%, 36%)", "hsl(220, 14%, 60%)", "hsl(0, 84%, 60%)"];

const SentimentAnalysis = () => {
  const [data, setData] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviews, setReviews] = useState<{ text: string; guest_name: string; date: string }[]>([]);
  const [newReview, setNewReview] = useState({ text: "", guest_name: "", date: new Date().toISOString().split("T")[0] });
  const { toast } = useToast();

  const addReview = () => {
    if (!newReview.text.trim()) return;
    setReviews(prev => [...prev, { ...newReview }]);
    setNewReview({ text: "", guest_name: "", date: new Date().toISOString().split("T")[0] });
  };

  const analyze = async () => {
    setLoading(true);
    try {
      const result = await api.ai<SentimentData>("sentiment", { reviews });
      setData(result);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const sentimentIcon = (s: string) => s === "positive" ? <ThumbsUp className="w-4 h-4 text-[hsl(var(--success))]" /> : s === "negative" ? <ThumbsDown className="w-4 h-4 text-destructive" /> : <Minus className="w-4 h-4 text-muted-foreground" />;

  const pieData = data ? [
    { name: "Positive", value: data.overall_sentiment.positive_pct },
    { name: "Neutral", value: data.overall_sentiment.neutral_pct },
    { name: "Negative", value: data.overall_sentiment.negative_pct },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <MessageCircleHeart className="w-7 h-7 text-primary" /> Sentiment Analysis
          </h1>
          <p className="text-muted-foreground mt-1">AI-powered guest feedback analysis & issue detection</p>
        </div>
        <Button onClick={analyze} disabled={loading} size="lg">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageCircleHeart className="w-4 h-4 mr-2" />}
          {loading ? "Analyzing..." : "Analyze Sentiment"}
        </Button>
      </div>

      {/* Review Input */}
      <Card>
        <CardHeader><CardTitle className="text-base">Add Guest Reviews</CardTitle><CardDescription>Paste reviews or leave empty for AI to generate sample analysis</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_200px_140px_auto] gap-2 items-end">
            <Textarea placeholder="Guest review text..." value={newReview.text} onChange={e => setNewReview(p => ({ ...p, text: e.target.value }))} rows={1} className="min-h-[40px]" />
            <Input placeholder="Guest name" value={newReview.guest_name} onChange={e => setNewReview(p => ({ ...p, guest_name: e.target.value }))} />
            <Input type="date" value={newReview.date} onChange={e => setNewReview(p => ({ ...p, date: e.target.value }))} />
            <Button onClick={addReview} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
          </div>
          {reviews.length > 0 && (
            <div className="space-y-2">
              {reviews.map((r, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded bg-muted text-sm">
                  <span className="flex-1 truncate">"{r.text}" — {r.guest_name || "Anonymous"}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setReviews(prev => prev.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {loading && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1,2,3,4].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6"><div className="h-40 bg-muted rounded" /></CardContent></Card>)}</div>}

      {data && (
        <>
          {/* Overall Sentiment */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Overall Sentiment</CardTitle><CardDescription>{data.overall_sentiment.label} — Score: {(data.overall_sentiment.score * 100).toFixed(0)}%</CardDescription></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" label={({ name, value }) => `${name} ${value}%`}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Topic Breakdown</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.topic_breakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 12 }} />
                    <YAxis dataKey="topic" type="category" tick={{ fontSize: 12 }} width={100} />
                    <Tooltip formatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
                    <Bar dataKey="sentiment_score" fill="hsl(35, 92%, 50%)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Reviews */}
          <Card>
            <CardHeader><CardTitle>Review Analysis</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data.reviews_analysis.map((r, i) => (
                <div key={i} className="p-4 rounded-lg border">
                  <div className="flex items-center gap-2 mb-2">
                    {sentimentIcon(r.sentiment)}
                    <span className="font-medium text-sm">{r.guest_name}</span>
                    <Badge variant={r.sentiment === "positive" ? "default" : r.sentiment === "negative" ? "destructive" : "secondary"}>
                      {r.sentiment} ({(r.score * 100).toFixed(0)}%)
                    </Badge>
                    {r.topics.map(t => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
                  </div>
                  <p className="text-sm text-muted-foreground italic">"{r.text}"</p>
                  {r.flagged_issues.length > 0 && (
                    <div className="mt-2 flex gap-1 flex-wrap">{r.flagged_issues.map((f, j) => <Badge key={j} variant="destructive" className="text-xs">{f}</Badge>)}</div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Alerts & Suggestions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" />Critical Alerts</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.critical_alerts.map((a, i) => <div key={i} className="p-3 rounded-lg bg-destructive/10 text-sm text-destructive">{a}</div>)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="w-5 h-5 text-primary" />Improvements</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.improvement_suggestions.map((s, i) => <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted"><span className="text-primary font-bold text-sm">{i+1}.</span><p className="text-sm">{s}</p></div>)}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default SentimentAnalysis;
