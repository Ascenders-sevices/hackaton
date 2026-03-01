import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";

const Messaging = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Messaging</h1>
      <p className="text-muted-foreground mt-1">Email & WhatsApp messaging hub</p>
    </div>
    <Card>
      <CardContent className="p-12 text-center">
        <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Messaging Center</h3>
        <p className="text-muted-foreground mt-1">Templates, campaigns & message logs coming soon</p>
      </CardContent>
    </Card>
  </div>
);

export default Messaging;
