import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Megaphone } from "lucide-react";

const Marketing = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Marketing</h1>
      <p className="text-muted-foreground mt-1">Campaigns, segments & analytics</p>
    </div>
    <Card>
      <CardContent className="p-12 text-center">
        <Megaphone className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Marketing Hub</h3>
        <p className="text-muted-foreground mt-1">Campaign builder and guest segmentation coming soon</p>
      </CardContent>
    </Card>
  </div>
);

export default Marketing;
