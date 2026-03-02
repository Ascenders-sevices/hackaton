import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Plus, Users, Star } from "lucide-react";

interface GuestProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_vip: boolean;
  tags: string[];
  notes: string | null;
}

const Guests = () => {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [guests, setGuests] = useState<GuestProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });

  const fetchGuests = async () => {
    if (!tenantId) return;
    try {
      const data = await api.get<GuestProfile[]>("/api/guests");
      setGuests(data || []);
    } catch (err) {
      console.error("Guests fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGuests(); }, [tenantId]);

  const handleCreate = async () => {
    if (!tenantId || !form.name) return;
    try {
      await api.post("/api/guests", {
        name: form.name, email: form.email || null,
        phone: form.phone || null, notes: form.notes || null,
      });
      toast({ title: "Guest added" });
      setDialogOpen(false);
      setForm({ name: "", email: "", phone: "", notes: "" });
      fetchGuests();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const toggleVip = async (id: string, current: boolean) => {
    try {
      await api.put(`/api/guests/${id}`, {
        is_vip: !current,
        ...(guests.find(g => g.id === id) || {}),
      });
      fetchGuests();
    } catch (err) { /* silent */ }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Guests</h1>
          <p className="text-muted-foreground mt-1">Guest profiles & history</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Add Guest</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add Guest</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              </div>
              <div className="space-y-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              <Button onClick={handleCreate} className="w-full">Add Guest</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <Card className="animate-pulse"><CardContent className="p-6"><div className="h-48 bg-muted rounded" /></CardContent></Card>
      ) : guests.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No guests yet</h3>
            <p className="text-muted-foreground mt-1">Add guest profiles to track their stays</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>VIP</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guests.map(g => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell>{g.email || "—"}</TableCell>
                  <TableCell>{g.phone || "—"}</TableCell>
                  <TableCell>
                    <button onClick={() => toggleVip(g.id, g.is_vip)}>
                      <Star className={`w-4 h-4 ${g.is_vip ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{g.notes || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
};

export default Guests;
