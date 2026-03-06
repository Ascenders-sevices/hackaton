import { useEffect, useMemo, useState } from "react";
import { Megaphone, MessageCircleMore, Pencil, Plus, Rocket, Users2 } from "lucide-react";

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

interface Contact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  email_opt_in: boolean;
  whatsapp_opt_in: boolean;
  created_at: string;
}

interface Segment {
  key: string;
  name: string;
  description: string;
  count: number;
  email_count: number;
  whatsapp_count: number;
  sample: string[];
}

interface Template {
  id: string;
  name: string;
  channel: "email" | "whatsapp";
  subject: string | null;
  content: string;
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  channel: "email" | "whatsapp";
  status: string;
  subject: string | null;
  content: string;
  template: {
    segment_key?: string;
    segment_name?: string;
    template_id?: string;
    template_name?: string;
  };
  logged_messages: number;
  delivered_messages: number;
  failed_messages: number;
  created_at: string;
  sent_at: string | null;
}

interface MessageLog {
  id: string;
  channel: string;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  status: string;
  source: string;
  created_at: string;
}

interface MarketingData {
  summary: {
    contact_count: number;
    email_opt_in_count: number;
    whatsapp_opt_in_count: number;
    campaign_count: number;
    draft_campaign_count: number;
    sent_campaign_count: number;
    logged_messages: number;
  };
  contacts: Contact[];
  segments: Segment[];
  campaigns: Campaign[];
  logs: MessageLog[];
  templates: Template[];
}

const emptyCampaignForm = {
  id: "",
  name: "",
  description: "",
  channel: "email",
  segment_key: "all_guests",
  template_id: "none",
  subject: "",
  content: "",
};

const emptyContactForm = {
  name: "",
  email: "",
  phone: "",
  source: "manual",
  email_opt_in: true,
  whatsapp_opt_in: false,
};

function parseErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Something went wrong";
  try {
    const parsed = JSON.parse(message);
    return parsed.error || message;
  } catch {
    return message;
  }
}

const Marketing = () => {
  const { toast } = useToast();
  const [data, setData] = useState<MarketingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [campaignSaving, setCampaignSaving] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [contactSaving, setContactSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [campaignForm, setCampaignForm] = useState(emptyCampaignForm);
  const [contactForm, setContactForm] = useState(emptyContactForm);

  const fetchMarketing = async () => {
    setLoading(true);
    try {
      const response = await api.get<MarketingData>("/api/marketing");
      setData(response);
    } catch (error) {
      toast({ title: "Failed to load marketing", description: parseErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMarketing();
  }, []);

  const selectedTemplate = useMemo(
    () => data?.templates.find((template) => template.id === campaignForm.template_id) || null,
    [data?.templates, campaignForm.template_id],
  );

  const handleTemplateSelect = (value: string) => {
    setCampaignForm((current) => ({ ...current, template_id: value }));
    if (value === "none") {
      return;
    }
    const template = data?.templates.find((item) => item.id === value);
    if (!template) return;
    setCampaignForm((current) => ({
      ...current,
      template_id: value,
      channel: template.channel,
      subject: template.subject || "",
      content: template.content,
    }));
  };

  const resetCampaignForm = () => setCampaignForm(emptyCampaignForm);

  const handleCreateOrUpdateCampaign = async () => {
    if (!campaignForm.name.trim() || !campaignForm.content.trim()) {
      toast({ title: "Campaign incomplete", description: "Name and content are required.", variant: "destructive" });
      return;
    }

    setCampaignSaving(true);
    try {
      const payload = {
        name: campaignForm.name.trim(),
        description: campaignForm.description.trim() || null,
        channel: campaignForm.channel,
        segment_key: campaignForm.segment_key,
        template_id: campaignForm.template_id !== "none" ? campaignForm.template_id : null,
        subject: campaignForm.subject.trim() || null,
        content: campaignForm.content.trim(),
      };

      if (campaignForm.id) {
        await api.put(`/api/marketing/campaigns/${campaignForm.id}`, payload);
        toast({ title: "Campaign updated" });
      } else {
        await api.post("/api/marketing/campaigns", payload);
        toast({ title: "Campaign draft created" });
      }

      resetCampaignForm();
      await fetchMarketing();
    } catch (error) {
      toast({ title: "Campaign save failed", description: parseErrorMessage(error), variant: "destructive" });
    } finally {
      setCampaignSaving(false);
    }
  };

  const handleEditCampaign = (campaign: Campaign) => {
    setCampaignForm({
      id: campaign.id,
      name: campaign.name,
      description: campaign.description || "",
      channel: campaign.channel,
      segment_key: campaign.template?.segment_key || "all_guests",
      template_id: campaign.template?.template_id || "none",
      subject: campaign.subject || "",
      content: campaign.content,
    });
    setActiveTab("campaigns");
  };

  const handleLaunchCampaign = async (campaign: Campaign) => {
    setLaunchingId(campaign.id);
    try {
      const response = await api.post<{ recipient_count: number }>(`/api/marketing/campaigns/${campaign.id}/launch`, {});
      toast({ title: "Campaign logged", description: `${response.recipient_count} recipient(s) added to campaign activity.` });
      await fetchMarketing();
    } catch (error) {
      toast({ title: "Launch failed", description: parseErrorMessage(error), variant: "destructive" });
    } finally {
      setLaunchingId(null);
    }
  };

  const handleCreateContact = async () => {
    if (!contactForm.email.trim() && !contactForm.phone.trim()) {
      toast({ title: "Contact incomplete", description: "Email or phone is required.", variant: "destructive" });
      return;
    }

    setContactSaving(true);
    try {
      await api.post("/api/marketing/contacts", {
        name: contactForm.name.trim() || null,
        email: contactForm.email.trim() || null,
        phone: contactForm.phone.trim() || null,
        source: contactForm.source,
        email_opt_in: contactForm.email_opt_in,
        whatsapp_opt_in: contactForm.whatsapp_opt_in,
      });
      toast({ title: "Contact added" });
      setContactForm(emptyContactForm);
      await fetchMarketing();
    } catch (error) {
      toast({ title: "Contact save failed", description: parseErrorMessage(error), variant: "destructive" });
    } finally {
      setContactSaving(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse text-muted-foreground">Loading marketing hub...</div>;
  }

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Marketing</h1>
          <p className="mt-1 text-muted-foreground">Audience segments, campaign drafts, and outreach logging.</p>
        </div>
        <Badge variant="outline" className="w-fit gap-2 px-3 py-1 text-xs uppercase tracking-[0.2em]">
          <Megaphone className="h-3.5 w-3.5" />
          AIR BEE Growth Hub
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Contacts</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">{summary?.contact_count || 0}</p><p className="text-xs text-muted-foreground">Manual marketing contacts captured</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Opt-ins</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">{summary?.email_opt_in_count || 0} / {summary?.whatsapp_opt_in_count || 0}</p><p className="text-xs text-muted-foreground">Email vs WhatsApp marketing consent</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Campaigns</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">{summary?.campaign_count || 0}</p><p className="text-xs text-muted-foreground">{summary?.draft_campaign_count || 0} drafts, {summary?.sent_campaign_count || 0} launched</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Logged Messages</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">{summary?.logged_messages || 0}</p><p className="text-xs text-muted-foreground">Campaign activity recorded in AIR BEE</p></CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start overflow-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Users2 className="h-5 w-5 text-primary" />Audience segments</CardTitle>
                <CardDescription>Use live property data to target guests with the right campaign.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {data?.segments.map((segment) => (
                  <div key={segment.key} className="rounded-2xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{segment.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{segment.description}</p>
                      </div>
                      <Badge>{segment.count}</Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full border px-3 py-1">Email {segment.email_count}</span>
                      <span className="rounded-full border px-3 py-1">WhatsApp {segment.whatsapp_count}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {segment.sample.map((name) => <Badge key={name} variant="outline">{name}</Badge>)}
                    </div>
                    <Button
                      variant="outline"
                      className="mt-4 w-full"
                      onClick={() => {
                        setCampaignForm((current) => ({ ...current, segment_key: segment.key }));
                        setActiveTab("campaigns");
                      }}
                    >
                      Use in campaign
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MessageCircleMore className="h-5 w-5 text-primary" />Recent activity</CardTitle>
                <CardDescription>Latest marketing-related outreach recorded by the system.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data?.logs || []).slice(0, 8).map((log) => (
                  <div key={log.id} className="rounded-xl border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{log.recipient_name || log.recipient_email || log.recipient_phone || "Recipient"}</p>
                      <Badge variant="outline">{log.channel}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{log.source.replace(/_/g, " ")} • {formatDate(log.created_at)}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Status: {log.status}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>{campaignForm.id ? "Edit campaign" : "Create campaign"}</CardTitle>
                <CardDescription>Create a draft, then launch it to log campaign activity.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={campaignForm.name} onChange={(event) => setCampaignForm((current) => ({ ...current, name: event.target.value }))} placeholder="Weekend direct-booking push" />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={campaignForm.description} onChange={(event) => setCampaignForm((current) => ({ ...current, description: event.target.value }))} />
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select value={campaignForm.channel} onValueChange={(value) => setCampaignForm((current) => ({ ...current, channel: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Audience</Label>
                    <Select value={campaignForm.segment_key} onValueChange={(value) => setCampaignForm((current) => ({ ...current, segment_key: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {data?.segments.map((segment) => <SelectItem key={segment.key} value={segment.key}>{segment.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Template</Label>
                  <Select value={campaignForm.template_id} onValueChange={handleTemplateSelect}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No template</SelectItem>
                      {data?.templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input value={campaignForm.subject} onChange={(event) => setCampaignForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Email subject" />
                </div>
                <div className="space-y-2">
                  <Label>Content</Label>
                  <Textarea rows={10} value={campaignForm.content} onChange={(event) => setCampaignForm((current) => ({ ...current, content: event.target.value }))} />
                </div>
                {selectedTemplate ? <p className="text-xs text-muted-foreground">Loaded from template: {selectedTemplate.name}</p> : null}
                <div className="flex gap-2">
                  <Button onClick={handleCreateOrUpdateCampaign} disabled={campaignSaving} className="flex-1">
                    {campaignSaving ? "Saving..." : campaignForm.id ? "Update draft" : "Save draft"}
                  </Button>
                  {campaignForm.id ? <Button variant="outline" onClick={resetCampaignForm}>Reset</Button> : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Campaign library</CardTitle>
                <CardDescription>Drafts can be edited. Launching a campaign records one message per matched recipient.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Audience</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Logged</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Sent</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data?.campaigns.map((campaign) => (
                        <TableRow key={campaign.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{campaign.name}</p>
                              <p className="text-xs text-muted-foreground">{campaign.subject || campaign.description || "No subject"}</p>
                            </div>
                          </TableCell>
                          <TableCell>{campaign.template?.segment_name || "Audience not set"}</TableCell>
                          <TableCell><Badge variant="outline">{campaign.status}</Badge></TableCell>
                          <TableCell>{campaign.logged_messages}</TableCell>
                          <TableCell><Badge variant="outline">{campaign.channel}</Badge></TableCell>
                          <TableCell>{campaign.sent_at ? formatDate(campaign.sent_at) : "-"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="icon" onClick={() => handleEditCampaign(campaign)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button onClick={() => handleLaunchCampaign(campaign)} disabled={launchingId === campaign.id}>
                                {launchingId === campaign.id ? "Launching..." : <><Rocket className="mr-2 h-4 w-4" />Launch</>}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary" />Add marketing contact</CardTitle>
                <CardDescription>Capture direct leads outside the core booking flow.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={contactForm.name} onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={contactForm.email} onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={contactForm.phone} onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Select value={contactForm.source} onValueChange={(value) => setContactForm((current) => ({ ...current, source: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="landing_page">Landing page</SelectItem>
                      <SelectItem value="walk_in">Walk-in enquiry</SelectItem>
                      <SelectItem value="partner">Partner referral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <div>
                    <p className="font-medium">Email opt-in</p>
                    <p className="text-xs text-muted-foreground">Allow this contact in email campaigns</p>
                  </div>
                  <Switch checked={contactForm.email_opt_in} onCheckedChange={(checked) => setContactForm((current) => ({ ...current, email_opt_in: checked }))} />
                </div>
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <div>
                    <p className="font-medium">WhatsApp opt-in</p>
                    <p className="text-xs text-muted-foreground">Allow this contact in WhatsApp campaigns</p>
                  </div>
                  <Switch checked={contactForm.whatsapp_opt_in} onCheckedChange={(checked) => setContactForm((current) => ({ ...current, whatsapp_opt_in: checked }))} />
                </div>
                <Button onClick={handleCreateContact} disabled={contactSaving} className="w-full">
                  {contactSaving ? "Saving..." : "Add contact"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Marketing contacts</CardTitle>
                <CardDescription>Opted-in contacts that can be used for direct outreach.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contact</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Consent</TableHead>
                        <TableHead>Added</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data?.contacts.map((contact) => (
                        <TableRow key={contact.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{contact.name || contact.email || contact.phone || "Contact"}</p>
                              <p className="text-xs text-muted-foreground">{contact.email || contact.phone || "No address"}</p>
                            </div>
                          </TableCell>
                          <TableCell>{contact.source || "manual"}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              {contact.email_opt_in ? <Badge variant="outline">Email</Badge> : null}
                              {contact.whatsapp_opt_in ? <Badge variant="outline">WhatsApp</Badge> : null}
                            </div>
                          </TableCell>
                          <TableCell>{formatDate(contact.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Marketing;
