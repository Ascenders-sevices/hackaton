import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

const CMS = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-3xl font-bold tracking-tight">CMS</h1>
      <p className="text-muted-foreground mt-1">Page builder & content management</p>
    </div>
    <Card>
      <CardContent className="p-12 text-center">
        <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Page Builder</h3>
        <p className="text-muted-foreground mt-1">Drag-and-drop CMS with SEO settings coming soon</p>
      </CardContent>
    </Card>
  </div>
);

export default CMS;
