import { useEffect, useMemo, useState } from "react";
import { Filter, Megaphone, MessageCircleMore, Pencil, Plus, Rocket, Trash2, Users2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

type SegmentSource = "guest_profiles" | "marketing_contacts";
type SegmentChannel = "any" | "email" | "whatsapp";

interface Contact { id: string; name: string | null; email: string | null; phone: string | null; source: string | null; email_opt_in: boolean; whatsapp_opt_in: boolean; created_at: string; }
interface SegmentRules { sources: SegmentSource[]; channel: SegmentChannel; vip_only: boolean; opt_in_only: boolean; min_bookings: number | null; max_bookings: number | null; arrival_window_days: number | null; lapsed_days: number | null; tag_any: string[]; search: string | null; contact_source: string | null; }
interface Segment { id?: string; key: string; name: string; description: string; count: number; email_count: number; whatsapp_count: number; sample: string[]; is_custom?: boolean; rules?: SegmentRules | null; }
interface Template { id: string; name: string; channel: "email" | "whatsapp"; subject: string | null; content: string; }
interface Campaign { id: string; name: string; description: string | null; channel: "email" | "whatsapp"; status: string; subject: string | null; content: string; template: { segment_key?: string; segment_name?: string; template_id?: string; template_name?: string; }; logged_messages: number; created_at: string; sent_at: string | null; }
interface MessageLog { id: string; channel: string; recipient_name: string | null; recipient_email: string | null; recipient_phone: string | null; status: string; source: string; created_at: string; }
interface MarketingData { summary: { contact_count: number; email_opt_in_count: number; whatsapp_opt_in_count: number; campaign_count: number; draft_campaign_count: number; sent_campaign_count: number; logged_messages: number; }; contacts: Contact[]; segments: Segment[]; campaigns: Campaign[]; logs: MessageLog[]; templates: Template[]; }

const emptyCampaignForm = { id: "", name: "", description: "", channel: "email", segment_key: "all_guests", template_id: "none", subject: "", content: "" };
const emptyContactForm = { name: "", email: "", phone: "", source: "manual", email_opt_in: true, whatsapp_opt_in: false };
const emptySegmentForm = { id: "", name: "", description: "", sources: ["guest_profiles", "marketing_contacts"] as SegmentSource[], channel: "any" as SegmentChannel, vip_only: false, opt_in_only: false, min_bookings: "", max_bookings: "", arrival_window_days: "", lapsed_days: "", tag_any: "", search: "", contact_source: "any" };

function parseErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Something went wrong";
  try { const parsed = JSON.parse(message); return parsed.error || message; } catch { return message; }
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRules(rules?: SegmentRules | null): SegmentRules {
  return {
    sources: rules?.sources?.length ? rules.sources : ["guest_profiles", "marketing_contacts"],
    channel: rules?.channel || "any",
    vip_only: Boolean(rules?.vip_only),
    opt_in_only: Boolean(rules?.opt_in_only),
    min_bookings: rules?.min_bookings ?? null,
    max_bookings: rules?.max_bookings ?? null,
    arrival_window_days: rules?.arrival_window_days ?? null,
    lapsed_days: rules?.lapsed_days ?? null,
    tag_any: rules?.tag_any || [],
    search: rules?.search || null,
    contact_source: rules?.contact_source || null,
  };
}

function segmentToForm(segment?: Segment) {
  const rules = normalizeRules(segment?.rules || null);
  return {
    id: segment?.id || "",
    name: segment?.name || "",
    description: segment?.description || "",
    sources: rules.sources,
    channel: rules.channel,
    vip_only: rules.vip_only,
    opt_in_only: rules.opt_in_only,
    min_bookings: rules.min_bookings?.toString() || "",
    max_bookings: rules.max_bookings?.toString() || "",
    arrival_window_days: rules.arrival_window_days?.toString() || "",
    lapsed_days: rules.lapsed_days?.toString() || "",
    tag_any: rules.tag_any.join(", "),
    search: rules.search || "",
    contact_source: rules.contact_source || "any",
  };
}

const Marketing = () => {
  const { toast } = useToast();
  const [data, setData] = useState<MarketingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [campaignSaving, setCampaignSaving] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);
  const [segmentSaving, setSegmentSaving] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [segmentDeletingId, setSegmentDeletingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [campaignForm, setCampaignForm] = useState(emptyCampaignForm);
  const [contactForm, setContactForm] = useState(emptyContactForm);
  const [segmentForm, setSegmentForm] = useState(emptySegmentForm);

  const fetchMarketing = async () => {
    setLoading(true);
    try { setData(await api.get<MarketingData>("/api/marketing")); }
    catch (error) { toast({ title: "Failed to load marketing", description: parseErrorMessage(error), variant: "destructive" }); }
    finally { setLoading(false); }
  };

  useEffect(() => { void fetchMarketing(); }, []);

  const selectedTemplate = useMemo(() => data?.templates.find((template) => template.id === campaignForm.template_id) || null, [data?.templates, campaignForm.template_id]);
  const selectedCampaignSegment = useMemo(() => data?.segments.find((segment) => segment.key === campaignForm.segment_key) || null, [data?.segments, campaignForm.segment_key]);
  const customSegments = useMemo(() => (data?.segments || []).filter((segment) => segment.is_custom), [data?.segments]);
  const builtInSegments = useMemo(() => (data?.segments || []).filter((segment) => !segment.is_custom), [data?.segments]);

  const previewRules = useMemo(() => ({
    sources: segmentForm.sources,
    channel: segmentForm.channel,
    vip_only: segmentForm.vip_only,
    opt_in_only: segmentForm.opt_in_only,
    min_bookings: parseOptionalNumber(segmentForm.min_bookings),
    max_bookings: parseOptionalNumber(segmentForm.max_bookings),
    arrival_window_days: parseOptionalNumber(segmentForm.arrival_window_days),
    lapsed_days: parseOptionalNumber(segmentForm.lapsed_days),
    tag_any: segmentForm.tag_any.split(",").map((item) => item.trim()).filter(Boolean),
    search: segmentForm.search.trim() || null,
    contact_source: segmentForm.contact_source === "any" ? null : segmentForm.contact_source,
  }), [segmentForm]);

  const toggleSegmentSource = (source: SegmentSource, checked: boolean) => {
    setSegmentForm((current) => {
      const sources = checked ? Array.from(new Set([...current.sources, source])) as SegmentSource[] : current.sources.filter((item) => item !== source);
      return { ...current, sources };
    });
  };

  const handleTemplateSelect = (value: string) => {
    setCampaignForm((current) => ({ ...current, template_id: value }));
    if (value === "none") return;
    const template = data?.templates.find((item) => item.id === value);
    if (!template) return;
    setCampaignForm((current) => ({ ...current, template_id: value, channel: template.channel, subject: template.subject || "", content: template.content }));
  };

  const handleSaveCampaign = async () => {
    if (!campaignForm.name.trim() || !campaignForm.content.trim()) {
      toast({ title: "Campaign incomplete", description: "Name and content are required.", variant: "destructive" });
      return;
    }
    setCampaignSaving(true);
    try {
      const payload = { name: campaignForm.name.trim(), description: campaignForm.description.trim() || null, channel: campaignForm.channel, segment_key: campaignForm.segment_key, template_id: campaignForm.template_id !== "none" ? campaignForm.template_id : null, subject: campaignForm.subject.trim() || null, content: campaignForm.content.trim() };
      if (campaignForm.id) { await api.put(`/api/marketing/campaigns/${campaignForm.id}`, payload); toast({ title: "Campaign updated" }); }
      else { await api.post("/api/marketing/campaigns", payload); toast({ title: "Campaign draft created" }); }
      setCampaignForm(emptyCampaignForm);
      await fetchMarketing();
    } catch (error) {
      toast({ title: "Campaign save failed", description: parseErrorMessage(error), variant: "destructive" });
    } finally { setCampaignSaving(false); }
  };

  const handleLaunchCampaign = async (campaign: Campaign) => {
    setLaunchingId(campaign.id);
    try {
      const response = await api.post<{ recipient_count: number }>(`/api/marketing/campaigns/${campaign.id}/launch`, {});
      toast({ title: "Campaign logged", description: `${response.recipient_count} recipient(s) added to campaign activity.` });
      await fetchMarketing();
    } catch (error) {
      toast({ title: "Launch failed", description: parseErrorMessage(error), variant: "destructive" });
    } finally { setLaunchingId(null); }
  };

  const handleSaveContact = async () => {
    if (!contactForm.email.trim() && !contactForm.phone.trim()) {
      toast({ title: "Contact incomplete", description: "Email or phone is required.", variant: "destructive" });
      return;
    }
    setContactSaving(true);
    try {
      await api.post("/api/marketing/contacts", { name: contactForm.name.trim() || null, email: contactForm.email.trim() || null, phone: contactForm.phone.trim() || null, source: contactForm.source, email_opt_in: contactForm.email_opt_in, whatsapp_opt_in: contactForm.whatsapp_opt_in });
      toast({ title: "Contact added" });
      setContactForm(emptyContactForm);
      await fetchMarketing();
    } catch (error) {
      toast({ title: "Contact save failed", description: parseErrorMessage(error), variant: "destructive" });
    } finally { setContactSaving(false); }
  };
  const handleSaveSegment = async () => {
    if (!segmentForm.name.trim()) {
      toast({ title: "Segment incomplete", description: "Segment name is required.", variant: "destructive" });
      return;
    }
    if (segmentForm.sources.length === 0) {
      toast({ title: "Segment incomplete", description: "Select at least one audience source.", variant: "destructive" });
      return;
    }
    setSegmentSaving(true);
    try {
      const payload = { name: segmentForm.name.trim(), description: segmentForm.description.trim() || null, rules: previewRules };
      if (segmentForm.id) { await api.put(`/api/marketing/segments/${segmentForm.id}`, payload); toast({ title: "Segment updated" }); }
      else { await api.post("/api/marketing/segments", payload); toast({ title: "Segment created" }); }
      setSegmentForm(emptySegmentForm);
      await fetchMarketing();
    } catch (error) {
      toast({ title: "Segment save failed", description: parseErrorMessage(error), variant: "destructive" });
    } finally { setSegmentSaving(false); }
  };

  const handleDeleteSegment = async (segment: Segment) => {
    if (!segment.id || !window.confirm(`Archive segment "${segment.name}"?`)) return;
    setSegmentDeletingId(segment.id);
    try {
      await api.delete(`/api/marketing/segments/${segment.id}`);
      toast({ title: "Segment archived" });
      if (segmentForm.id === segment.id) setSegmentForm(emptySegmentForm);
      await fetchMarketing();
    } catch (error) {
      toast({ title: "Archive failed", description: parseErrorMessage(error), variant: "destructive" });
    } finally { setSegmentDeletingId(null); }
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading marketing hub...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Marketing</h1>
          <p className="mt-1 text-muted-foreground">Audience segments, campaign drafts, and outreach logging.</p>
        </div>
        <Badge variant="outline" className="w-fit gap-2 px-3 py-1 text-xs uppercase tracking-[0.2em]"><Megaphone className="h-3.5 w-3.5" />AIR BEE Growth Hub</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Contacts</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{data?.summary.contact_count || 0}</p><p className="text-xs text-muted-foreground">Manual marketing contacts captured</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Opt-ins</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{data?.summary.email_opt_in_count || 0} / {data?.summary.whatsapp_opt_in_count || 0}</p><p className="text-xs text-muted-foreground">Email vs WhatsApp consent</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Campaigns</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{data?.summary.campaign_count || 0}</p><p className="text-xs text-muted-foreground">{data?.summary.draft_campaign_count || 0} drafts, {data?.summary.sent_campaign_count || 0} launched</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Logged Messages</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{data?.summary.logged_messages || 0}</p><p className="text-xs text-muted-foreground">Campaign activity recorded in AIR BEE</p></CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start overflow-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="segments">Segments</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Users2 className="h-5 w-5 text-primary" />Audience segments</CardTitle><CardDescription>Built-in and custom segments share the same campaign and messaging pipeline.</CardDescription></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {data?.segments.map((segment) => (
                  <div key={segment.key} className="rounded-2xl border p-4">
                    <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{segment.name}</p><Badge variant={segment.is_custom ? "secondary" : "outline"}>{segment.is_custom ? "Custom" : "Built-in"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{segment.description}</p></div><Badge>{segment.count}</Badge></div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="rounded-full border px-3 py-1">Email {segment.email_count}</span><span className="rounded-full border px-3 py-1">WhatsApp {segment.whatsapp_count}</span></div>
                    <div className="mt-4 flex flex-wrap gap-2">{segment.sample.map((name) => <Badge key={name} variant="outline">{name}</Badge>)}</div>
                    <div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => { setCampaignForm((current) => ({ ...current, segment_key: segment.key })); setActiveTab("campaigns"); }}>Use in campaign</Button>{segment.is_custom ? <Button variant="outline" onClick={() => { setSegmentForm(segmentToForm(segment)); setActiveTab("segments"); }}><Pencil className="h-4 w-4" /></Button> : null}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><MessageCircleMore className="h-5 w-5 text-primary" />Recent activity</CardTitle><CardDescription>Latest marketing outreach recorded by the system.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {(data?.logs || []).slice(0, 8).map((log) => (
                  <div key={log.id} className="rounded-xl border p-3 text-sm"><div className="flex items-center justify-between gap-2"><p className="font-medium">{log.recipient_name || log.recipient_email || log.recipient_phone || "Recipient"}</p><Badge variant="outline">{log.channel}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{log.source.replace(/_/g, " ")} • {formatDate(log.created_at)}</p><p className="mt-2 text-xs text-muted-foreground">Status: {log.status}</p></div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="segments" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5 text-primary" />{segmentForm.id ? "Edit custom segment" : "Create custom segment"}</CardTitle><CardDescription>Save reusable rules for campaigns and messaging.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Name</Label><Input value={segmentForm.name} onChange={(event) => setSegmentForm((current) => ({ ...current, name: event.target.value }))} placeholder="High-value repeat guests" /></div>
                <div className="space-y-2"><Label>Description</Label><Textarea rows={3} value={segmentForm.description} onChange={(event) => setSegmentForm((current) => ({ ...current, description: event.target.value }))} placeholder="Guests with 2+ stays and an email address." /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-xl border p-3"><div><p className="font-medium">Guests</p><p className="text-xs text-muted-foreground">Profiles and bookings</p></div><Switch checked={segmentForm.sources.includes("guest_profiles")} onCheckedChange={(checked) => toggleSegmentSource("guest_profiles", checked)} /></div>
                  <div className="flex items-center justify-between rounded-xl border p-3"><div><p className="font-medium">Marketing contacts</p><p className="text-xs text-muted-foreground">Manual leads and opted-ins</p></div><Switch checked={segmentForm.sources.includes("marketing_contacts")} onCheckedChange={(checked) => toggleSegmentSource("marketing_contacts", checked)} /></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Channel fit</Label><Select value={segmentForm.channel} onValueChange={(value: SegmentChannel) => setSegmentForm((current) => ({ ...current, channel: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Any contact method</SelectItem><SelectItem value="email">Email reachable only</SelectItem><SelectItem value="whatsapp">WhatsApp reachable only</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Contact source</Label><Select value={segmentForm.contact_source} onValueChange={(value) => setSegmentForm((current) => ({ ...current, contact_source: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Any source</SelectItem><SelectItem value="manual">Manual</SelectItem><SelectItem value="landing_page">Landing page</SelectItem><SelectItem value="walk_in">Walk-in enquiry</SelectItem><SelectItem value="partner">Partner referral</SelectItem></SelectContent></Select></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Minimum stays</Label><Input value={segmentForm.min_bookings} onChange={(event) => setSegmentForm((current) => ({ ...current, min_bookings: event.target.value }))} placeholder="2" inputMode="numeric" /></div>
                  <div className="space-y-2"><Label>Maximum stays</Label><Input value={segmentForm.max_bookings} onChange={(event) => setSegmentForm((current) => ({ ...current, max_bookings: event.target.value }))} placeholder="Optional" inputMode="numeric" /></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Arriving within days</Label><Input value={segmentForm.arrival_window_days} onChange={(event) => setSegmentForm((current) => ({ ...current, arrival_window_days: event.target.value }))} placeholder="7" inputMode="numeric" /></div>
                  <div className="space-y-2"><Label>Lapsed for days</Label><Input value={segmentForm.lapsed_days} onChange={(event) => setSegmentForm((current) => ({ ...current, lapsed_days: event.target.value }))} placeholder="90" inputMode="numeric" /></div>
                </div>
                <div className="space-y-2"><Label>Tags</Label><Input value={segmentForm.tag_any} onChange={(event) => setSegmentForm((current) => ({ ...current, tag_any: event.target.value }))} placeholder="vip, corporate, family" /></div>
                <div className="space-y-2"><Label>Search keyword</Label><Input value={segmentForm.search} onChange={(event) => setSegmentForm((current) => ({ ...current, search: event.target.value }))} placeholder="gmail.com, Sharma, corporate" /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-xl border p-3"><div><p className="font-medium">VIP only</p><p className="text-xs text-muted-foreground">Only flagged VIP guests</p></div><Switch checked={segmentForm.vip_only} onCheckedChange={(checked) => setSegmentForm((current) => ({ ...current, vip_only: checked }))} /></div>
                  <div className="flex items-center justify-between rounded-xl border p-3"><div><p className="font-medium">Opt-in only</p><p className="text-xs text-muted-foreground">Only opted-in marketing contacts</p></div><Switch checked={segmentForm.opt_in_only} onCheckedChange={(checked) => setSegmentForm((current) => ({ ...current, opt_in_only: checked }))} /></div>
                </div>
                <div className="flex gap-2"><Button onClick={handleSaveSegment} disabled={segmentSaving} className="flex-1">{segmentSaving ? "Saving..." : segmentForm.id ? "Update segment" : "Create segment"}</Button>{segmentForm.id ? <Button variant="outline" onClick={() => setSegmentForm(emptySegmentForm)}>Reset</Button> : null}</div>
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Custom segment library</CardTitle><CardDescription>Saved rules appear in campaign and messaging audience pickers.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  {customSegments.length ? customSegments.map((segment) => (
                    <div key={segment.key} className="rounded-2xl border p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{segment.name}</p><Badge variant="secondary">Custom</Badge></div><p className="mt-1 text-sm text-muted-foreground">{segment.description}</p><div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="rounded-full border px-3 py-1">Total {segment.count}</span><span className="rounded-full border px-3 py-1">Email {segment.email_count}</span><span className="rounded-full border px-3 py-1">WhatsApp {segment.whatsapp_count}</span></div></div><div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => setSegmentForm(segmentToForm(segment))}><Pencil className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={() => handleDeleteSegment(segment)} disabled={segmentDeletingId === segment.id}><Trash2 className="h-4 w-4" /></Button></div></div></div>
                  )) : <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">No custom segments yet. Create one from the builder to save reusable audience rules.</div>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Built-in segments</CardTitle><CardDescription>Defaults remain available and cannot be edited.</CardDescription></CardHeader>
                <CardContent className="space-y-3">{builtInSegments.map((segment) => <div key={segment.key} className="rounded-xl border p-3 text-sm"><div className="flex items-center justify-between gap-2"><p className="font-medium">{segment.name}</p><Badge variant="outline">{segment.count}</Badge></div><p className="mt-1 text-muted-foreground">{segment.description}</p></div>)}</CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="campaigns" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <Card>
              <CardHeader><CardTitle>{campaignForm.id ? "Edit campaign" : "Create campaign"}</CardTitle><CardDescription>Create a draft, then launch it to log campaign activity.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Name</Label><Input value={campaignForm.name} onChange={(event) => setCampaignForm((current) => ({ ...current, name: event.target.value }))} placeholder="Weekend direct-booking push" /></div>
                <div className="space-y-2"><Label>Description</Label><Input value={campaignForm.description} onChange={(event) => setCampaignForm((current) => ({ ...current, description: event.target.value }))} /></div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                  <div className="space-y-2"><Label>Channel</Label><Select value={campaignForm.channel} onValueChange={(value) => setCampaignForm((current) => ({ ...current, channel: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Audience</Label><Select value={campaignForm.segment_key} onValueChange={(value) => setCampaignForm((current) => ({ ...current, segment_key: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{data?.segments.map((segment) => <SelectItem key={segment.key} value={segment.key}>{segment.name}</SelectItem>)}</SelectContent></Select>{selectedCampaignSegment ? <p className="text-xs text-muted-foreground">{selectedCampaignSegment.count} total matches, {campaignForm.channel === "whatsapp" ? selectedCampaignSegment.whatsapp_count : selectedCampaignSegment.email_count} reachable on this channel.</p> : null}</div>
                </div>
                <div className="space-y-2"><Label>Template</Label><Select value={campaignForm.template_id} onValueChange={handleTemplateSelect}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No template</SelectItem>{data?.templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Subject</Label><Input value={campaignForm.subject} onChange={(event) => setCampaignForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Email subject" /></div>
                <div className="space-y-2"><Label>Content</Label><Textarea rows={10} value={campaignForm.content} onChange={(event) => setCampaignForm((current) => ({ ...current, content: event.target.value }))} /></div>
                {selectedTemplate ? <p className="text-xs text-muted-foreground">Loaded from template: {selectedTemplate.name}</p> : null}
                <div className="flex gap-2"><Button onClick={handleSaveCampaign} disabled={campaignSaving} className="flex-1">{campaignSaving ? "Saving..." : campaignForm.id ? "Update draft" : "Save draft"}</Button>{campaignForm.id ? <Button variant="outline" onClick={() => setCampaignForm(emptyCampaignForm)}>Reset</Button> : null}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Campaign library</CardTitle><CardDescription>Launching a campaign records one message per matched recipient.</CardDescription></CardHeader>
              <CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Audience</TableHead><TableHead>Status</TableHead><TableHead>Logged</TableHead><TableHead>Channel</TableHead><TableHead>Sent</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{data?.campaigns.map((campaign) => <TableRow key={campaign.id}><TableCell><div><p className="font-medium">{campaign.name}</p><p className="text-xs text-muted-foreground">{campaign.subject || campaign.description || "No subject"}</p></div></TableCell><TableCell>{campaign.template?.segment_name || "Audience not set"}</TableCell><TableCell><Badge variant="outline">{campaign.status}</Badge></TableCell><TableCell>{campaign.logged_messages}</TableCell><TableCell><Badge variant="outline">{campaign.channel}</Badge></TableCell><TableCell>{campaign.sent_at ? formatDate(campaign.sent_at) : "-"}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-2"><Button variant="outline" size="icon" onClick={() => { setCampaignForm({ id: campaign.id, name: campaign.name, description: campaign.description || "", channel: campaign.channel, segment_key: campaign.template?.segment_key || "all_guests", template_id: campaign.template?.template_id || "none", subject: campaign.subject || "", content: campaign.content }); setActiveTab("campaigns"); }}><Pencil className="h-4 w-4" /></Button><Button onClick={() => handleLaunchCampaign(campaign)} disabled={launchingId === campaign.id}>{launchingId === campaign.id ? "Launching..." : <><Rocket className="mr-2 h-4 w-4" />Launch</>}</Button></div></TableCell></TableRow>)}</TableBody></Table></div></CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary" />Add marketing contact</CardTitle><CardDescription>Capture direct leads outside the booking flow.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Name</Label><Input value={contactForm.name} onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))} /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={contactForm.email} onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))} /></div>
                <div className="space-y-2"><Label>Phone</Label><Input value={contactForm.phone} onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))} /></div>
                <div className="space-y-2"><Label>Source</Label><Select value={contactForm.source} onValueChange={(value) => setContactForm((current) => ({ ...current, source: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Manual</SelectItem><SelectItem value="landing_page">Landing page</SelectItem><SelectItem value="walk_in">Walk-in enquiry</SelectItem><SelectItem value="partner">Partner referral</SelectItem></SelectContent></Select></div>
                <div className="flex items-center justify-between rounded-xl border p-3"><div><p className="font-medium">Email opt-in</p><p className="text-xs text-muted-foreground">Allow this contact in email campaigns</p></div><Switch checked={contactForm.email_opt_in} onCheckedChange={(checked) => setContactForm((current) => ({ ...current, email_opt_in: checked }))} /></div>
                <div className="flex items-center justify-between rounded-xl border p-3"><div><p className="font-medium">WhatsApp opt-in</p><p className="text-xs text-muted-foreground">Allow this contact in WhatsApp campaigns</p></div><Switch checked={contactForm.whatsapp_opt_in} onCheckedChange={(checked) => setContactForm((current) => ({ ...current, whatsapp_opt_in: checked }))} /></div>
                <Button onClick={handleSaveContact} disabled={contactSaving} className="w-full">{contactSaving ? "Saving..." : "Add contact"}</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Marketing contacts</CardTitle><CardDescription>Opted-in contacts available for direct outreach.</CardDescription></CardHeader>
              <CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Contact</TableHead><TableHead>Source</TableHead><TableHead>Consent</TableHead><TableHead>Added</TableHead></TableRow></TableHeader><TableBody>{data?.contacts.map((contact) => <TableRow key={contact.id}><TableCell><div><p className="font-medium">{contact.name || contact.email || contact.phone || "Contact"}</p><p className="text-xs text-muted-foreground">{contact.email || contact.phone || "No address"}</p></div></TableCell><TableCell>{contact.source || "manual"}</TableCell><TableCell><div className="flex flex-wrap gap-2">{contact.email_opt_in ? <Badge variant="outline">Email</Badge> : null}{contact.whatsapp_opt_in ? <Badge variant="outline">WhatsApp</Badge> : null}</div></TableCell><TableCell>{formatDate(contact.created_at)}</TableCell></TableRow>)}</TableBody></Table></div></CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Marketing;
