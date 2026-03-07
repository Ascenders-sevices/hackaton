import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { Hexagon, ArrowRight, BedDouble, CalendarDays, BarChart3, Bot, Brain, Zap, UserCheck, MessageCircleHeart, ShieldAlert, Shield, Sparkles } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  const features = [
    { icon: Bot, title: "AI Copilot", desc: "Conversational AI that understands your property data and provides actionable business decisions." },
    { icon: Brain, title: "Demand Forecasting", desc: "Time-series occupancy & revenue predictions with seasonal pattern analysis." },
    { icon: Zap, title: "Dynamic Pricing", desc: "AI-optimized room pricing with revenue simulation before applying changes." },
    { icon: UserCheck, title: "Guest Intelligence", desc: "Loyalty scoring, churn prediction, and automated guest segmentation." },
    { icon: MessageCircleHeart, title: "Sentiment Analysis", desc: "AI analyzes guest reviews to detect issues and improvement opportunities." },
    { icon: ShieldAlert, title: "Booking Risk Prediction", desc: "Predict no-shows, cancellations, and overbooking risk per booking." },
    { icon: BedDouble, title: "Room Management", desc: "Manage inventory, categories, and pricing rules from a single dashboard." },
    { icon: CalendarDays, title: "Booking Engine", desc: "Accept reservations, track payments, and manage guest check-ins." },
    { icon: BarChart3, title: "Revenue Analytics", desc: "Real-time occupancy trends, revenue projections, and daily AI briefings." },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <Hexagon className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">AIR BEE</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate("/auth")}>Sign In</Button>
            <Button onClick={() => navigate("/auth")}>Get Started<ArrowRight className="w-4 h-4 ml-1" /></Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-24 text-center">
        <Badge variant="outline" className="mb-6 px-4 py-1.5 gap-2 text-sm">
          <Sparkles className="w-3.5 h-3.5" /> AWS AI for Bharat Hackathon — Team Slingers
        </Badge>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight max-w-5xl mx-auto leading-[1.1]">
          AI-Powered Commerce Intelligence for{" "}
          <span className="text-primary">Hotels & Resorts</span>
        </h1>
        <p className="text-xl text-muted-foreground mt-6 max-w-3xl mx-auto">
          AIR BEE transforms booking data into predictive insights. 6 AI engines — Demand Forecasting, Dynamic Pricing, Guest Intelligence, Sentiment Analysis, Risk Prediction & AI Copilot — in one multi-tenant SaaS platform.
        </p>
        <div className="flex items-center justify-center gap-4 mt-10">
          <Button size="lg" onClick={() => navigate("/auth")} className="text-base px-8">
            Start Free <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <Button size="lg" variant="outline" onClick={() => navigate("/book")} className="text-base px-8">
            Open Booking Page
          </Button>
          <Button size="lg" variant="ghost" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })} className="text-base px-8">
            See Features
          </Button>
        </div>
      </section>

      {/* Problem */}
      <section className="bg-muted/50 py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-8">
            <Badge variant="secondary" className="mb-3">Problem Statement</Badge>
            <h2 className="text-3xl font-bold">Hotels rely on guesswork</h2>
          </div>
          <p className="text-muted-foreground text-center text-lg leading-relaxed">
            Hotels and resorts rely on manual pricing and reactive decision-making due to the absence of accessible AI-driven demand forecasting and market intelligence tools.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
            {[
              { label: "Revenue Leakage", value: "15-25%", desc: "Lost due to manual pricing" },
              { label: "Decision Lag", value: "2-3 days", desc: "Reactive vs proactive" },
              { label: "Market Gap", value: "90%+", desc: "Mid-scale hotels lack AI tools" },
            ].map(s => (
              <div key={s.label} className="text-center p-6 rounded-xl bg-background border">
                <p className="text-3xl font-bold text-primary">{s.value}</p>
                <p className="font-semibold mt-1">{s.label}</p>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Engines Highlight */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <Badge variant="secondary" className="mb-3">6 AI Engines</Badge>
          <h2 className="text-3xl font-bold">Intelligence at every touchpoint</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-5xl mx-auto">
          {[
            { icon: Bot, label: "AI Copilot" },
            { icon: Brain, label: "Forecasting" },
            { icon: Zap, label: "Dynamic Pricing" },
            { icon: UserCheck, label: "Guest Intel" },
            { icon: MessageCircleHeart, label: "Sentiment" },
            { icon: ShieldAlert, label: "Risk Prediction" },
          ].map(e => (
            <div key={e.label} className="flex flex-col items-center p-4 rounded-xl border bg-card hover:border-primary/50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
                <e.icon className="w-6 h-6 text-primary" />
              </div>
              <span className="text-sm font-medium text-center">{e.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-muted/50 py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-3">Full Feature Set</Badge>
            <h2 className="text-3xl font-bold">Everything you need to maximize revenue</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {features.map((f) => (
              <div key={f.title} className="p-6 rounded-xl border bg-card hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <f.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* USP */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <Badge variant="secondary" className="mb-3">What Makes AIR BEE Different</Badge>
            <h2 className="text-3xl font-bold">USP</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              "6 AI engines working together — not isolated tools",
              "Revenue simulation before applying any price changes",
              "Demand forecasting tailored for Indian hospitality market",
              "Guest churn prediction & loyalty scoring",
              "Sentiment analysis auto-detects operational issues",
              "Booking risk prediction reduces no-shows by 40%",
              "Multi-tenant SaaS — enterprise intelligence for mid-scale hotels",
              "Daily AI briefings for proactive management",
            ].map((u, i) => (
              <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-muted border">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-primary font-bold text-sm">{i + 1}</span>
                </div>
                <p className="text-sm">{u}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="bg-muted/50 py-16">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <Badge variant="secondary" className="mb-3">Team</Badge>
          <h2 className="text-3xl font-bold mb-4">Team Slingers</h2>
          <p className="text-muted-foreground">
            Led by <strong>Mohamed Insaf</strong> — building AI-powered commerce intelligence for the Indian hospitality market.
          </p>
          <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
            <Badge variant="outline" className="gap-1"><Shield className="w-3 h-3" />React + TypeScript</Badge>
            <Badge variant="outline" className="gap-1"><Shield className="w-3 h-3" />PostgreSQL</Badge>
            <Badge variant="outline" className="gap-1"><Shield className="w-3 h-3" />AI/ML Forecasting</Badge>
            <Badge variant="outline" className="gap-1"><Shield className="w-3 h-3" />Multi-Tenant SaaS</Badge>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h2 className="text-4xl font-bold mb-4">Ready to optimize your revenue?</h2>
        <p className="text-muted-foreground text-lg mb-8">Start using AIR BEE today — no credit card required.</p>
        <Button size="lg" onClick={() => navigate("/auth")} className="text-base px-10">
          Get Started Free <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </section>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2"><Hexagon className="w-4 h-4 text-primary" />AIR BEE — AI Commerce Intelligence</div>
          <span>AWS AI for Bharat Hackathon 2026</span>
        </div>
      </footer>
    </div>
  );
};

export default Index;
