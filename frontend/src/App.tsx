import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import { AdminLayout } from "@/components/admin/AdminLayout";
import Dashboard from "@/pages/admin/Dashboard";
import Rooms from "@/pages/admin/Rooms";
import Bookings from "@/pages/admin/Bookings";
import Guests from "@/pages/admin/Guests";
import Marketing from "@/pages/admin/Marketing";
import Messaging from "@/pages/admin/Messaging";
import Reports from "@/pages/admin/Reports";
import Settings from "@/pages/admin/Settings";
import AICopilot from "@/pages/admin/AICopilot";
import Forecasting from "@/pages/admin/Forecasting";
import DynamicPricing from "@/pages/admin/DynamicPricing";
import GuestIntelligence from "@/pages/admin/GuestIntelligence";
import SentimentAnalysis from "@/pages/admin/SentimentAnalysis";
import BookingRisk from "@/pages/admin/BookingRisk";
import PublicBooking from "./pages/PublicBooking";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
