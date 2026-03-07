import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const Settings = () => {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenant, setTenant] = useState<any>(null);

  useEffect(() => {
    if (!tenantId) return;
    api.get<{ tenant: any }>("/api/settings").then((data) => {
      setTenant(data.tenant);
      setLoading(false);
    }).catch((err) => {
      console.error("Settings fetch error:", err);
      setLoading(false);
    });
  }, [tenantId]);

  const handleSave = async () => {
    if (!tenant) return;
    setSaving(true);
    try {
      await api.put("/api/settings", {
        name: tenant.name,
        contact_email: tenant.contact_email,
        contact_phone: tenant.contact_phone,
        address: tenant.address,
        gst_enabled: tenant.gst_enabled,
        gst_percentage: tenant.gst_percentage,
        gst_number: tenant.gst_number,
        service_charge_enabled: tenant.service_charge_enabled,
        service_charge_percentage: tenant.service_charge_percentage,
        currency: tenant.currency,
        timezone: tenant.timezone,
      });
      toast({ title: "Settings saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading settings...</div>;

  const update = (field: string, value: any) => setTenant((t: any) => ({ ...t, [field]: value }));
  const bookingUrl = tenant?.slug ? `${window.location.origin}/book/${tenant.slug}` : "";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure your property</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Property Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Property Name</Label><Input value={tenant?.name || ""} onChange={(e) => update("name", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Property Slug</Label><Input value={tenant?.slug || ""} readOnly /></div>
            <div className="space-y-2"><Label>Public Booking URL</Label><Input value={bookingUrl} readOnly /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Email</Label><Input value={tenant?.contact_email || ""} onChange={(e) => update("contact_email", e.target.value)} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={tenant?.contact_phone || ""} onChange={(e) => update("contact_phone", e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>Address</Label><Input value={tenant?.address || ""} onChange={(e) => update("address", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Currency</Label><Input value={tenant?.currency || "INR"} onChange={(e) => update("currency", e.target.value)} /></div>
            <div className="space-y-2"><Label>Timezone</Label><Input value={tenant?.timezone || "Asia/Kolkata"} onChange={(e) => update("timezone", e.target.value)} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Tax & Charges</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enable GST</Label>
            <Switch checked={tenant?.gst_enabled || false} onCheckedChange={(v) => update("gst_enabled", v)} />
          </div>
          {tenant?.gst_enabled && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>GST %</Label><Input type="number" value={tenant?.gst_percentage || 0} onChange={(e) => update("gst_percentage", parseFloat(e.target.value))} /></div>
              <div className="space-y-2"><Label>GST Number</Label><Input value={tenant?.gst_number || ""} onChange={(e) => update("gst_number", e.target.value)} /></div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <Label>Enable Service Charge</Label>
            <Switch checked={tenant?.service_charge_enabled || false} onCheckedChange={(v) => update("service_charge_enabled", v)} />
          </div>
          {tenant?.service_charge_enabled && (
            <div className="space-y-2"><Label>Service Charge %</Label><Input type="number" value={tenant?.service_charge_percentage || 0} onChange={(e) => update("service_charge_percentage", parseFloat(e.target.value))} /></div>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Settings"}</Button>
    </div>
  );
};

export default Settings;
