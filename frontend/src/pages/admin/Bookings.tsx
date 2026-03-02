import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Plus, CalendarDays } from "lucide-react";

interface Booking {
  id: string;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  check_in: string;
  check_out: string;
  guests: number;
  total_amount: number;
  status: string;
  payment_status: string;
  amount_paid: number;
  room_id: string;
  rooms?: { name: string } | null;
}

interface Room {
  id: string;
  name: string;
  base_price: number;
}

const Bookings = () => {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [form, setForm] = useState({
    guest_name: "", guest_email: "", guest_phone: "",
    room_id: "", check_in: "", check_out: "", guests: 1, total_amount: 0,
  });

  const fetchData = async () => {
    if (!tenantId) return;
    try {
      const [bookingsData, roomsData] = await Promise.all([
        api.get<any[]>("/api/bookings"),
        api.get<any[]>("/api/rooms"),
      ]);
      setBookings((bookingsData || []).map((b: any) => ({
        ...b,
        rooms: b.room_name ? { name: b.room_name } : null,
      })));
      setRooms((roomsData || []).filter((r: any) => r.status === "available"));
    } catch (err) {
      console.error("Bookings fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [tenantId]);

  const handleCreate = async () => {
    if (!tenantId || !form.guest_name || !form.room_id || !form.check_in || !form.check_out) return;
    try {
      await api.post("/api/bookings", {
        guest_name: form.guest_name,
        guest_email: form.guest_email || null,
        guest_phone: form.guest_phone || null,
        room_id: form.room_id,
        check_in: form.check_in,
        check_out: form.check_out,
        guests: form.guests,
        total_amount: form.total_amount,
      });
      toast({ title: "Booking created" });
      setDialogOpen(false);
      setForm({ guest_name: "", guest_email: "", guest_phone: "", room_id: "", check_in: "", check_out: "", guests: 1, total_amount: 0 });
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30",
      confirmed: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30",
      cancelled: "bg-destructive/10 text-destructive border-destructive/30",
      completed: "bg-primary/10 text-primary border-primary/30",
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] || ""}`}>{status}</span>;
  };

  const paymentBadge = (status: string) => {
    const colors: Record<string, string> = {
      unpaid: "bg-destructive/10 text-destructive",
      partial: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
      paid: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || ""}`}>{status}</span>;
  };

  // Auto-calculate price
  useEffect(() => {
    if (form.room_id && form.check_in && form.check_out) {
      const room = rooms.find(r => r.id === form.room_id);
      if (room) {
        const nights = Math.max(1, Math.ceil((new Date(form.check_out).getTime() - new Date(form.check_in).getTime()) / 86400000));
        setForm(f => ({ ...f, total_amount: Number(room.base_price) * nights }));
      }
    }
  }, [form.room_id, form.check_in, form.check_out, rooms]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bookings</h1>
          <p className="text-muted-foreground mt-1">Manage reservations</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />New Booking</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Booking</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Guest Name</Label>
                <Input value={form.guest_name} onChange={(e) => setForm(f => ({ ...f, guest_name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={form.guest_email} onChange={(e) => setForm(f => ({ ...f, guest_email: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={form.guest_phone} onChange={(e) => setForm(f => ({ ...f, guest_phone: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Room</Label>
                <Select value={form.room_id} onValueChange={(v) => setForm(f => ({ ...f, room_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
                  <SelectContent>
                    {rooms.map(r => <SelectItem key={r.id} value={r.id}>{r.name} — {formatCurrency(r.base_price)}/night</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Check-in</Label>
                  <Input type="date" value={form.check_in} onChange={(e) => setForm(f => ({ ...f, check_in: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Check-out</Label>
                  <Input type="date" value={form.check_out} onChange={(e) => setForm(f => ({ ...f, check_out: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Guests</Label>
                  <Input type="number" value={form.guests} onChange={(e) => setForm(f => ({ ...f, guests: parseInt(e.target.value) || 1 }))} />
                </div>
                <div className="space-y-2">
                  <Label>Total (₹)</Label>
                  <Input type="number" value={form.total_amount} onChange={(e) => setForm(f => ({ ...f, total_amount: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
              <Button onClick={handleCreate} className="w-full">Create Booking</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <Card className="animate-pulse"><CardContent className="p-6"><div className="h-48 bg-muted rounded" /></CardContent></Card>
      ) : bookings.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <CalendarDays className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No bookings yet</h3>
            <p className="text-muted-foreground mt-1">Create your first booking</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guest</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{b.guest_name}</p>
                        {b.guest_email && <p className="text-xs text-muted-foreground">{b.guest_email}</p>}
                      </div>
                    </TableCell>
                    <TableCell>{(b as any).rooms?.name || "—"}</TableCell>
                    <TableCell>{formatDate(b.check_in)}</TableCell>
                    <TableCell>{formatDate(b.check_out)}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(b.total_amount)}</TableCell>
                    <TableCell>{statusBadge(b.status)}</TableCell>
                    <TableCell>{paymentBadge(b.payment_status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default Bookings;
