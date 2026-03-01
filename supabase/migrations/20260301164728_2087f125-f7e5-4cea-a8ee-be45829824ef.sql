
-- Create enum for app roles
CREATE TYPE public.app_role AS ENUM ('owner', 'staff', 'guest');

-- Create enum for room status
CREATE TYPE public.room_status AS ENUM ('available', 'maintenance', 'unavailable');

-- Create enum for housekeeping status
CREATE TYPE public.housekeeping_status AS ENUM ('clean', 'dirty', 'in_progress', 'inspecting');

-- Create enum for booking status
CREATE TYPE public.booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');

-- Create enum for payment status
CREATE TYPE public.payment_status AS ENUM ('unpaid', 'partial', 'paid');

-- TENANTS
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  domain TEXT,
  settings JSONB DEFAULT '{}',
  gst_enabled BOOLEAN DEFAULT false,
  gst_percentage NUMERIC(5,2) DEFAULT 0,
  gst_number TEXT,
  service_charge_enabled BOOLEAN DEFAULT false,
  service_charge_percentage NUMERIC(5,2) DEFAULT 0,
  email_settings JSONB DEFAULT '{}',
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  currency TEXT DEFAULT 'INR',
  timezone TEXT DEFAULT 'Asia/Kolkata',
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, tenant_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ROOM CATEGORIES
CREATE TABLE public.room_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3B82F6',
  display_order INT DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.room_categories ENABLE ROW LEVEL SECURITY;

-- ROOMS
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.room_categories(id) ON DELETE SET NULL,
  max_guests INT DEFAULT 2,
  base_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  status room_status DEFAULT 'available',
  amenities JSONB DEFAULT '[]',
  images JSONB DEFAULT '[]',
  housekeeping_status housekeeping_status DEFAULT 'clean',
  minimum_stay INT DEFAULT 1,
  base_occupancy INT DEFAULT 2,
  extra_guest_fee NUMERIC(10,2) DEFAULT 0,
  check_in_time TEXT DEFAULT '14:00',
  check_out_time TEXT DEFAULT '11:00',
  cancellation_policy TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- ROOM PRICING RULES
CREATE TABLE public.room_pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL DEFAULT 'seasonal',
  modifier_type TEXT NOT NULL DEFAULT 'percentage',
  price_modifier NUMERIC(10,2) NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  days_of_week INT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.room_pricing_rules ENABLE ROW LEVEL SECURITY;

-- GUEST PROFILES
CREATE TABLE public.guest_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  tags TEXT[] DEFAULT '{}',
  is_vip BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.guest_profiles ENABLE ROW LEVEL SECURITY;

-- BOOKINGS
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES public.guest_profiles(id) ON DELETE SET NULL,
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  guest_phone TEXT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  guests INT DEFAULT 1,
  total_amount NUMERIC(10,2) DEFAULT 0,
  base_amount NUMERIC(10,2) DEFAULT 0,
  tax_amount NUMERIC(10,2) DEFAULT 0,
  service_charge NUMERIC(10,2) DEFAULT 0,
  status booking_status DEFAULT 'pending',
  payment_status payment_status DEFAULT 'unpaid',
  payment_method TEXT,
  amount_paid NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- BOOKING PAYMENTS
CREATE TABLE public.booking_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT DEFAULT 'cash',
  received_at TIMESTAMPTZ DEFAULT now(),
  received_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

-- INVOICES
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  amount NUMERIC(10,2) DEFAULT 0,
  tax_amount NUMERIC(10,2) DEFAULT 0,
  total_amount NUMERIC(10,2) DEFAULT 0,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- EMAIL LOGS
CREATE TABLE public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  email_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT,
  status TEXT DEFAULT 'sent',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- PAGES (CMS)
CREATE TABLE public.pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content_blocks JSONB DEFAULT '[]',
  is_published BOOLEAN DEFAULT false,
  meta_title TEXT,
  meta_description TEXT,
  og_image TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, slug)
);
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

-- MARKETING CONTACTS
CREATE TABLE public.marketing_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone TEXT,
  source TEXT,
  email_opt_in BOOLEAN DEFAULT false,
  whatsapp_opt_in BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.marketing_contacts ENABLE ROW LEVEL SECURITY;

-- GUEST SEGMENTS
CREATE TABLE public.guest_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  segment_type TEXT DEFAULT 'manual',
  rules JSONB DEFAULT '{}',
  guest_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.guest_segments ENABLE ROW LEVEL SECURITY;

-- SEGMENT MEMBERS
CREATE TABLE public.segment_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES public.guest_segments(id) ON DELETE CASCADE,
  guest_email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.segment_members ENABLE ROW LEVEL SECURITY;

-- CAMPAIGNS
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  channel TEXT DEFAULT 'email',
  status TEXT DEFAULT 'draft',
  subject TEXT,
  content TEXT,
  template JSONB DEFAULT '{}',
  segment_id UUID REFERENCES public.guest_segments(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- CAMPAIGN METRICS
CREATE TABLE public.campaign_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  status TEXT DEFAULT 'sent',
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;

-- MESSAGE TEMPLATES
CREATE TABLE public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  channel TEXT DEFAULT 'email',
  category TEXT,
  subject TEXT,
  body TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- MESSAGE CAMPAIGNS
CREATE TABLE public.message_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_name TEXT NOT NULL,
  channel TEXT DEFAULT 'email',
  template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL,
  audience_filter JSONB DEFAULT '{}',
  scheduled_at TIMESTAMPTZ,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.message_campaigns ENABLE ROW LEVEL SECURITY;

-- MESSAGE LOGS
CREATE TABLE public.message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.message_campaigns(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  channel TEXT DEFAULT 'email',
  status TEXT DEFAULT 'sent',
  sent_at TIMESTAMPTZ DEFAULT now(),
  provider_response JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;

-- OTA CHANNELS
CREATE TABLE public.ota_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_name TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  api_credentials JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT false,
  sync_bookings BOOLEAN DEFAULT false,
  sync_rates BOOLEAN DEFAULT false,
  sync_availability BOOLEAN DEFAULT false,
  property_id TEXT,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.ota_channels ENABLE ROW LEVEL SECURITY;

-- OTA ROOM MAPPINGS
CREATE TABLE public.ota_room_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.ota_channels(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  external_room_id TEXT,
  external_room_name TEXT,
  rate_plan_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.ota_room_mappings ENABLE ROW LEVEL SECURITY;

-- OTA BOOKINGS
CREATE TABLE public.ota_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.ota_channels(id) ON DELETE CASCADE,
  external_booking_id TEXT NOT NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  check_in DATE,
  check_out DATE,
  total_amount NUMERIC(10,2) DEFAULT 0,
  commission NUMERIC(10,2) DEFAULT 0,
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.ota_bookings ENABLE ROW LEVEL SECURITY;

-- OTA SYNC LOGS
CREATE TABLE public.ota_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.ota_channels(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL,
  direction TEXT DEFAULT 'inbound',
  status TEXT DEFAULT 'success',
  records_processed INT DEFAULT 0,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.ota_sync_logs ENABLE ROW LEVEL SECURITY;

-- STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public) VALUES ('resort-images', 'resort-images', true);

-- HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.check_room_availability(
  _room_id UUID,
  _check_in DATE,
  _check_out DATE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE room_id = _room_id
      AND status NOT IN ('cancelled')
      AND check_in < _check_out
      AND check_out > _check_in
  )
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Updated_at triggers
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_room_categories_updated_at BEFORE UPDATE ON public.room_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_guest_profiles_updated_at BEFORE UPDATE ON public.guest_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pages_updated_at BEFORE UPDATE ON public.pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Mark room dirty after checkout
CREATE OR REPLACE FUNCTION public.mark_room_dirty_after_checkout()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE public.rooms SET housekeeping_status = 'dirty' WHERE id = NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_mark_room_dirty
AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.mark_room_dirty_after_checkout();

-- Auto-provision tenant on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_tenant_id UUID;
  user_name TEXT;
  tenant_slug TEXT;
BEGIN
  user_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  tenant_slug := lower(replace(user_name, ' ', '-')) || '-' || substr(NEW.id::text, 1, 8);
  
  INSERT INTO public.tenants (name, slug)
  VALUES (user_name || '''s Property', tenant_slug)
  RETURNING id INTO new_tenant_id;
  
  INSERT INTO public.profiles (id, tenant_id, full_name)
  VALUES (NEW.id, new_tenant_id, user_name);
  
  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, new_tenant_id, 'owner');
  
  INSERT INTO public.room_categories (tenant_id, name, color, display_order) VALUES
    (new_tenant_id, 'Standard', '#6B7280', 1),
    (new_tenant_id, 'Deluxe', '#3B82F6', 2),
    (new_tenant_id, 'Suite', '#8B5CF6', 3),
    (new_tenant_id, 'Villa', '#10B981', 4);
  
  INSERT INTO public.pages (tenant_id, slug, title, content_blocks, is_published) VALUES
    (new_tenant_id, 'home', 'Home', '[{"type":"hero","data":{"title":"Welcome to our Property","subtitle":"Experience luxury and comfort","image":""}}]'::jsonb, true),
    (new_tenant_id, 'about', 'About Us', '[{"type":"text","data":{"content":"Tell your story here."}}]'::jsonb, false);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS POLICIES

-- Tenants
CREATE POLICY "Users can view own tenant" ON public.tenants
  FOR SELECT USING (id = public.get_user_tenant_id());
CREATE POLICY "Owners can update own tenant" ON public.tenants
  FOR UPDATE USING (id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- User Roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

-- Room Categories
CREATE POLICY "Tenant members can view categories" ON public.room_categories
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Owners can insert categories" ON public.room_categories
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners can update categories" ON public.room_categories
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners can delete categories" ON public.room_categories
  FOR DELETE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));

-- Rooms
CREATE POLICY "Tenant members can view rooms" ON public.rooms
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Staff can insert rooms" ON public.rooms
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'staff')));
CREATE POLICY "Staff can update rooms" ON public.rooms
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'staff')));
CREATE POLICY "Owners can delete rooms" ON public.rooms
  FOR DELETE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));

-- Room Pricing Rules
CREATE POLICY "Tenant can view pricing" ON public.room_pricing_rules
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Owners can insert pricing" ON public.room_pricing_rules
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners can update pricing" ON public.room_pricing_rules
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners can delete pricing" ON public.room_pricing_rules
  FOR DELETE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));

-- Guest Profiles
CREATE POLICY "Tenant can view guests" ON public.guest_profiles
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Staff can insert guests" ON public.guest_profiles
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'staff')));
CREATE POLICY "Staff can update guests" ON public.guest_profiles
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'staff')));
CREATE POLICY "Owners can delete guests" ON public.guest_profiles
  FOR DELETE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));

-- Bookings
CREATE POLICY "Tenant can view bookings" ON public.bookings
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Staff can insert bookings" ON public.bookings
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'staff')));
CREATE POLICY "Staff can update bookings" ON public.bookings
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'staff')));
CREATE POLICY "Owners can delete bookings" ON public.bookings
  FOR DELETE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));

-- Booking Payments
CREATE POLICY "Tenant can view payments" ON public.booking_payments
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Staff can insert payments" ON public.booking_payments
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'staff')));

-- Invoices
CREATE POLICY "Tenant can view invoices" ON public.invoices
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Owners can insert invoices" ON public.invoices
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));

-- Email Logs
CREATE POLICY "Tenant can view email logs" ON public.email_logs
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "System can insert email logs" ON public.email_logs
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Pages (CMS)
CREATE POLICY "Tenant can view pages" ON public.pages
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Public can view published pages" ON public.pages
  FOR SELECT TO anon USING (is_published = true);
CREATE POLICY "Owners can insert pages" ON public.pages
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners can update pages" ON public.pages
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners can delete pages" ON public.pages
  FOR DELETE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));

-- Marketing Contacts
CREATE POLICY "Tenant can view contacts" ON public.marketing_contacts
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Staff can insert contacts" ON public.marketing_contacts
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'staff')));
CREATE POLICY "Staff can update contacts" ON public.marketing_contacts
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'staff')));

-- Guest Segments
CREATE POLICY "Tenant can view segments" ON public.guest_segments
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Owners can insert segments" ON public.guest_segments
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners can update segments" ON public.guest_segments
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners can delete segments" ON public.guest_segments
  FOR DELETE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));

-- Segment Members
CREATE POLICY "Tenant can view segment members" ON public.segment_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.guest_segments gs WHERE gs.id = segment_id AND gs.tenant_id = public.get_user_tenant_id())
  );
CREATE POLICY "Owners can insert segment members" ON public.segment_members
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.guest_segments gs WHERE gs.id = segment_id AND gs.tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'))
  );
CREATE POLICY "Owners can delete segment members" ON public.segment_members
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.guest_segments gs WHERE gs.id = segment_id AND gs.tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'))
  );

-- Campaigns
CREATE POLICY "Tenant can view campaigns" ON public.campaigns
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Owners can insert campaigns" ON public.campaigns
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners can update campaigns" ON public.campaigns
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners can delete campaigns" ON public.campaigns
  FOR DELETE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));

-- Campaign Metrics
CREATE POLICY "Tenant can view metrics" ON public.campaign_metrics
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.tenant_id = public.get_user_tenant_id())
  );

-- Message Templates
CREATE POLICY "Tenant can view templates" ON public.message_templates
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Owners can insert templates" ON public.message_templates
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners can update templates" ON public.message_templates
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners can delete templates" ON public.message_templates
  FOR DELETE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));

-- Message Campaigns
CREATE POLICY "Tenant can view msg campaigns" ON public.message_campaigns
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Owners can insert msg campaigns" ON public.message_campaigns
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners can update msg campaigns" ON public.message_campaigns
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));

-- Message Logs
CREATE POLICY "Tenant can view msg logs" ON public.message_logs
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

-- OTA Channels
CREATE POLICY "Tenant can view ota channels" ON public.ota_channels
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Owners can insert ota channels" ON public.ota_channels
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners can update ota channels" ON public.ota_channels
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners can delete ota channels" ON public.ota_channels
  FOR DELETE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));

-- OTA Room Mappings
CREATE POLICY "Tenant can view ota mappings" ON public.ota_room_mappings
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Owners can insert ota mappings" ON public.ota_room_mappings
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners can update ota mappings" ON public.ota_room_mappings
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'owner'));

-- OTA Bookings
CREATE POLICY "Tenant can view ota bookings" ON public.ota_bookings
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

-- OTA Sync Logs
CREATE POLICY "Tenant can view ota sync logs" ON public.ota_sync_logs
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

-- Storage policies for resort-images
CREATE POLICY "Public can view resort images" ON storage.objects
  FOR SELECT USING (bucket_id = 'resort-images');
CREATE POLICY "Authenticated users can upload resort images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'resort-images' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update resort images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'resort-images' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can delete resort images" ON storage.objects
  FOR DELETE USING (bucket_id = 'resort-images' AND auth.role() = 'authenticated');
