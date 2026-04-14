import { useState } from "react";
import { Copy, Check, Download, Video, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExtractVideoResponse } from "@workspace/api-client-react";

interface VideoResultProps {
  data: ExtractVideoResponse;
}

export function VideoResult({ data }: VideoResultProps) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const handleDownload = (url: string) => {
    // Open in a new tab to trigger download, as direct cross-origin download might be blocked
    window.open(url, "_blank");
  };

  return (
    <Card className="w-full max-w-2xl mx-auto overflow-hidden border-2 shadow-xl animate-in fade-in zoom-in-95 duration-300">
      <CardContent className="p-0 flex flex-col md:flex-row">
        {/* Media Section */}
        <div className="w-full md:w-2/5 bg-black relative flex items-center justify-center min-h-[200px] overflow-hidden">
          <video 
            src={data.videoUrl} 
            poster={data.thumbnailUrl || undefined}
            controls
            className="w-full h-full object-contain max-h-[300px]"
            data-testid="video-preview-player"
          >
            Your browser does not support the video tag.
          </video>
        </div>

        {/* Info & Actions Section */}
        <div className="p-6 w-full md:w-3/5 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-semibold text-lg line-clamp-2" data-testid="text-video-title">
              {data.title || "Untitled Video"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1" data-testid="text-video-quality">
              Quality: {data.quality || "Standard"}
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex gap-2">
              <Button 
                onClick={() => handleDownload(data.downloadUrl)} 
                className="flex-1 font-bold shadow-sm"
                data-testid="button-download-sd"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => copyToClipboard(data.downloadUrl)}
                data-testid="button-copy-sd"
                title="Copy SD Link"
              >
                {copiedUrl === data.downloadUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>

            {data.hdVideoUrl && (
              <div className="flex gap-2">
                <Button 
                  onClick={() => handleDownload(data.hdVideoUrl!)} 
                  variant="secondary"
                  className="flex-1 font-bold shadow-sm"
                  data-testid="button-download-hd"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download HD
                </Button>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => copyToClipboard(data.hdVideoUrl!)}
                  data-testid="button-copy-hd"
                  title="Copy HD Link"
                >
                  {copiedUrl === data.hdVideoUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
