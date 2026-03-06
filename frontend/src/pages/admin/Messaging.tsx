import { useEffect, useMemo, useState } from "react";
import { BellRing, Mail, MessageSquare, Pencil, Plus, Send, Trash2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

interface Template {
  id: string;
  name: string;
  channel: "email" | "whatsapp";
  subject: string | null;
  content: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface MessageLog {
  id: string;
  channel: "email" | "whatsapp";
  source: string;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  subject: string | null;
  content: string;
  status: string;
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

interface AudienceGuest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_vip: boolean;
  booking_count: number;
  next_check_in: string | null;
}

interface MessagingData {
  summary: {
    template_count: number;
    message_count: number;
    email_templates: number;
    whatsapp_templates: number;
    reachable_guests: number;
    recent_logged: number;
  };
  templates: Template[];
  logs: MessageLog[];
  segments: Segment[];
  audience: AudienceGuest[];
}

const emptyTemplateForm = {
  id: "",
  name: "",
  channel: "email",
  subject: "",
  content: "",
  variables: "guest_name, property_name",
};

const emptyComposer = {
  template_id: "none",
  channel: "email",
  segment_key: "all_guests",
  subject: "",
  content: "",
  manual_recipients: "",
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

function channelBadge(channel: string) {
  return channel === "whatsapp" ? "secondary" : "outline";
}

const Messaging = () => {
  const { toast } = useToast();
  const [data, setData] = useState<MessagingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [composer, setComposer] = useState(emptyComposer);

  const fetchMessaging = async () => {
    setLoading(true);
    try {
      const response = await api.get<MessagingData>("/api/messaging");
      setData(response);
    } catch (error) {
      toast({ title: "Failed to load messaging", description: parseErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMessaging();
  }, []);

  const selectedTemplate = useMemo(
    () => data?.templates.find((template) => template.id === composer.template_id) || null,
    [data?.templates, composer.template_id],
  );
  const selectedSegment = useMemo(
    () => data?.segments.find((segment) => segment.key === composer.segment_key) || null,
    [data?.segments, composer.segment_key],
  );

  const openTemplateDialog = (template?: Template) => {
    if (template) {
      setTemplateForm({
        id: template.id,
        name: template.name,
        channel: template.channel,
        subject: template.subject || "",
        content: template.content,
        variables: template.variables.join(", "),
      });
    } else {
      setTemplateForm(emptyTemplateForm);
    }
    setTemplateDialogOpen(true);
  };

  const handleTemplateSave = async () => {
    if (!templateForm.name.trim() || !templateForm.content.trim()) {
      toast({ title: "Template incomplete", description: "Name and content are required.", variant: "destructive" });
      return;
    }

    setSavingTemplate(true);
    try {
      const payload = {
        name: templateForm.name.trim(),
        channel: templateForm.channel,
        subject: templateForm.subject.trim() || null,
        content: templateForm.content.trim(),
        variables: templateForm.variables
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      };

      if (templateForm.id) {
        await api.put(`/api/messaging/templates/${templateForm.id}`, payload);
        toast({ title: "Template updated" });
      } else {
        await api.post("/api/messaging/templates", payload);
        toast({ title: "Template created" });
      }

      setTemplateDialogOpen(false);
      setTemplateForm(emptyTemplateForm);
      await fetchMessaging();
    } catch (error) {
      toast({ title: "Template save failed", description: parseErrorMessage(error), variant: "destructive" });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      await api.delete(`/api/messaging/templates/${templateId}`);
      toast({ title: "Template deleted" });
      await fetchMessaging();
    } catch (error) {
      toast({ title: "Delete failed", description: parseErrorMessage(error), variant: "destructive" });
    }
  };

  const handleTemplateSelect = (value: string) => {
    setComposer((current) => ({ ...current, template_id: value }));
    if (value === "none") {
      return;
    }

    const template = data?.templates.find((item) => item.id === value);
    if (!template) return;

    setComposer((current) => ({
      ...current,
      template_id: value,
      channel: template.channel,
      subject: template.subject || "",
      content: template.content,
    }));
  };

  const handleSend = async () => {
    if (!composer.content.trim()) {
      toast({ title: "Message missing", description: "Content is required.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const response = await api.post<{ recipient_count: number }>("/api/messaging/send", {
        template_id: composer.template_id !== "none" ? composer.template_id : undefined,
        channel: composer.channel,
        segment_key: composer.segment_key,
        subject: composer.subject,
        content: composer.content,
        manual_recipients: composer.manual_recipients,
        source: "messaging_center",
      });
      toast({ title: "Message logged", description: `${response.recipient_count} recipient(s) added to activity.` });
      setComposer((current) => ({ ...current, manual_recipients: "" }));
      await fetchMessaging();
    } catch (error) {
      toast({ title: "Send failed", description: parseErrorMessage(error), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse text-muted-foreground">Loading messaging hub...</div>;
  }

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Messaging</h1>
          <p className="mt-1 text-muted-foreground">Templates, recipient targeting, and outreach activity.</p>
        </div>
        <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => openTemplateDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{templateForm.id ? "Edit template" : "Create template"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={templateForm.name} onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select value={templateForm.channel} onValueChange={(value) => setTemplateForm((current) => ({ ...current, channel: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={templateForm.subject} onChange={(event) => setTemplateForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Optional for WhatsApp" />
              </div>
              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea rows={8} value={templateForm.content} onChange={(event) => setTemplateForm((current) => ({ ...current, content: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Variables</Label>
                <Input
                  value={templateForm.variables}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, variables: event.target.value }))}
                  placeholder="guest_name, property_name, next_check_in"
                />
              </div>
              <Button onClick={handleTemplateSave} disabled={savingTemplate} className="w-full">
                {savingTemplate ? "Saving..." : templateForm.id ? "Update template" : "Create template"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Templates</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">{summary?.template_count || 0}</p><p className="text-xs text-muted-foreground">Reusable message templates</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Reachable Guests</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">{summary?.reachable_guests || 0}</p><p className="text-xs text-muted-foreground">Guest profiles with email or phone</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Email / WhatsApp</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">{summary?.email_templates || 0} / {summary?.whatsapp_templates || 0}</p><p className="text-xs text-muted-foreground">Templates split by channel</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Recent Activity</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">{summary?.recent_logged || 0}</p><p className="text-xs text-muted-foreground">Logged outreach items</p></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="compose" className="space-y-4">
        <TabsList className="w-full justify-start overflow-auto">
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-primary" />Compose outreach</CardTitle>
                <CardDescription>
                  Messages are logged inside AIR BEE. Connect a delivery provider later to turn these into live sends.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Template</Label>
                    <Select value={composer.template_id} onValueChange={handleTemplateSelect}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No template</SelectItem>
                        {data?.templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select value={composer.channel} onValueChange={(value) => setComposer((current) => ({ ...current, channel: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Audience segment</Label>
                    <Select value={composer.segment_key} onValueChange={(value) => setComposer((current) => ({ ...current, segment_key: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {data?.segments.map((segment) => (
                          <SelectItem key={segment.key} value={segment.key}>{segment.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Manual recipients</Label>
                    <Input
                      value={composer.manual_recipients}
                      onChange={(event) => setComposer((current) => ({ ...current, manual_recipients: event.target.value }))}
                      placeholder="Optional: comma-separated email or phone"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input
                    value={composer.subject}
                    onChange={(event) => setComposer((current) => ({ ...current, subject: event.target.value }))}
                    placeholder="Email subject"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Content</Label>
                  <Textarea
                    rows={10}
                    value={composer.content}
                    onChange={(event) => setComposer((current) => ({ ...current, content: event.target.value }))}
                    placeholder="Write your message body here"
                  />
                </div>

                <Button onClick={handleSend} disabled={sending} className="w-full md:w-auto">
                  {sending ? "Logging outreach..." : "Log outreach"}
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />Audience insight</CardTitle>
                  <CardDescription>{selectedSegment?.description || "Select a segment to see its estimated reach."}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total</p>
                      <p className="mt-2 text-2xl font-semibold">{selectedSegment?.count || 0}</p>
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Channel reach</p>
                      <p className="mt-2 text-2xl font-semibold">
                        {composer.channel === "whatsapp" ? selectedSegment?.whatsapp_count || 0 : selectedSegment?.email_count || 0}
                      </p>
                    </div>
                  </div>
                  {selectedTemplate ? (
                    <div className="rounded-xl border bg-muted/30 p-3 text-sm">
                      <p className="font-medium">Using template</p>
                      <p className="text-muted-foreground">{selectedTemplate.name}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedTemplate.variables.map((variable) => <Badge key={variable} variant="outline">{variable}</Badge>)}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <p className="mb-2 text-sm font-medium">Sample recipients</p>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      {(selectedSegment?.sample || []).length > 0 ? (
                        selectedSegment?.sample.map((name) => (
                          <div key={name} className="rounded-lg border px-3 py-2">{name}</div>
                        ))
                      ) : (
                        <div className="rounded-lg border border-dashed px-3 py-5 text-center">No sample recipients yet.</div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><BellRing className="h-5 w-5 text-primary" />Reachable guests</CardTitle>
                  <CardDescription>Recent profiles your staff can contact right now.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(data?.audience || []).slice(0, 6).map((guest) => (
                    <div key={guest.id} className="rounded-xl border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{guest.name}</p>
                        {guest.is_vip ? <Badge>VIP</Badge> : null}
                      </div>
                      <p className="text-muted-foreground">{guest.email || guest.phone || "No contact details"}</p>
                      {guest.next_check_in ? <p className="mt-1 text-xs text-muted-foreground">Next check-in: {formatDate(guest.next_check_in)}</p> : null}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Template library</CardTitle>
              <CardDescription>Reusable copy blocks for operational and promotional outreach.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Variables</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.templates.map((template) => (
                      <TableRow key={template.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{template.name}</p>
                            <p className="text-xs text-muted-foreground">{template.subject || "No subject"}</p>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant={channelBadge(template.channel)}>{template.channel}</Badge></TableCell>
                        <TableCell className="max-w-[280px]">
                          <div className="flex flex-wrap gap-1">
                            {template.variables.map((variable) => <Badge key={variable} variant="outline">{variable}</Badge>)}
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(template.updated_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="icon" onClick={() => openTemplateDialog(template)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => handleDeleteTemplate(template.id)}>
                              <Trash2 className="h-4 w-4" />
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
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Outreach activity log</CardTitle>
              <CardDescription>Every message composed in AIR BEE is recorded here.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell><Badge variant={channelBadge(log.channel)}>{log.channel}</Badge></TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{log.recipient_name || "Unknown recipient"}</p>
                            <p className="text-xs text-muted-foreground">{log.recipient_email || log.recipient_phone || "No address"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.source.replace(/_/g, " ")}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[320px]">
                          <p className="font-medium">{log.subject || "No subject"}</p>
                          <p className="truncate text-xs text-muted-foreground">{log.content}</p>
                        </TableCell>
                        <TableCell><Badge variant="outline">{log.status}</Badge></TableCell>
                        <TableCell>{formatDate(log.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Messaging;
