import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { AdminLayout } from "@/components/admin/AdminLayout";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PublicBooking = lazy(() => import("./pages/PublicBooking"));
const Dashboard = lazy(() => import("@/pages/admin/Dashboard"));
const Rooms = lazy(() => import("@/pages/admin/Rooms"));
const Bookings = lazy(() => import("@/pages/admin/Bookings"));
const Guests = lazy(() => import("@/pages/admin/Guests"));
const Marketing = lazy(() => import("@/pages/admin/Marketing"));
const Messaging = lazy(() => import("@/pages/admin/Messaging"));
const Reports = lazy(() => import("@/pages/admin/Reports"));
const Settings = lazy(() => import("@/pages/admin/Settings"));
const AICopilot = lazy(() => import("@/pages/admin/AICopilot"));
const Forecasting = lazy(() => import("@/pages/admin/Forecasting"));
const DynamicPricing = lazy(() => import("@/pages/admin/DynamicPricing"));
const GuestIntelligence = lazy(() => import("@/pages/admin/GuestIntelligence"));
const SentimentAnalysis = lazy(() => import("@/pages/admin/SentimentAnalysis"));
const BookingRisk = lazy(() => import("@/pages/admin/BookingRisk"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
    Loading...
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/book" element={<PublicBooking />} />
              <Route path="/book/:slug" element={<PublicBooking />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="rooms" element={<Rooms />} />
                <Route path="bookings" element={<Bookings />} />
                <Route path="guests" element={<Guests />} />
                <Route path="marketing" element={<Marketing />} />
                <Route path="messaging" element={<Messaging />} />
                <Route path="reports" element={<Reports />} />
                <Route path="settings" element={<Settings />} />
                <Route path="ai-copilot" element={<AICopilot />} />
                <Route path="forecasting" element={<Forecasting />} />
                <Route path="dynamic-pricing" element={<DynamicPricing />} />
                <Route path="guest-intelligence" element={<GuestIntelligence />} />
                <Route path="sentiment" element={<SentimentAnalysis />} />
                <Route path="booking-risk" element={<BookingRisk />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
