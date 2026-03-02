import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { SprayCan, CheckCircle2, Clock, Search } from "lucide-react";

interface Room {
  id: string;
  name: string;
  housekeeping_status: string;
  status: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  clean: { label: "Clean", color: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30", icon: CheckCircle2 },
  dirty: { label: "Dirty", color: "bg-destructive/10 text-destructive border-destructive/30", icon: SprayCan },
  in_progress: { label: "In Progress", color: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30", icon: Clock },
  inspecting: { label: "Inspecting", color: "bg-primary/10 text-primary border-primary/30", icon: Search },
};

const Housekeeping = () => {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRooms = async () => {
    if (!tenantId) return;
    try {
      const data = await api.get<Room[]>("/api/housekeeping");
      setRooms(data || []);
    } catch (err) {
      console.error("Housekeeping fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRooms(); }, [tenantId]);

  const updateStatus = async (roomId: string, newStatus: string) => {
    try {
      await api.put(`/api/housekeeping/${roomId}`, { housekeeping_status: newStatus });
      toast({ title: `Room marked as ${newStatus}` });
      fetchRooms();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Housekeeping</h1>
        <p className="text-muted-foreground mt-1">Manage room cleaning status</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6"><div className="h-24 bg-muted rounded" /></CardContent></Card>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map(room => {
            const config = statusConfig[room.housekeeping_status] || statusConfig.clean;
            const Icon = config.icon;
            return (
              <Card key={room.id} className="overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold">{room.name}</h3>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border mt-1 ${config.color}`}>
                        <Icon className="w-3 h-3" />
                        {config.label}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {room.housekeeping_status !== "clean" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(room.id, "clean")}>Mark Clean</Button>
                    )}
                    {room.housekeeping_status !== "in_progress" && room.housekeeping_status === "dirty" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(room.id, "in_progress")}>Start Cleaning</Button>
                    )}
                    {room.housekeeping_status === "in_progress" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(room.id, "inspecting")}>Ready for Inspection</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Housekeeping;
