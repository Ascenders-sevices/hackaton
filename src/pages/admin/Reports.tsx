import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

const Reports = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
      <p className="text-muted-foreground mt-1">Analytics & reporting</p>
    </div>
    <Card>
      <CardContent className="p-12 text-center">
        <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Reports Dashboard</h3>
        <p className="text-muted-foreground mt-1">Revenue analytics and occupancy reports coming soon</p>
      </CardContent>
    </Card>
  </div>
);

export default Reports;
