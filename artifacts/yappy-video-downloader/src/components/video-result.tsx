import { useEffect, useMemo, useState } from "react";
import { Copy, Check, Download, Video, RadioTower } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ExtractVideoResponse, QualityOption } from "@workspace/api-client-react";

interface VideoResultProps {
  data: ExtractVideoResponse;
}

function getPlatformName(platform: ExtractVideoResponse["platform"]) {
  return platform === "rutube" ? "Rutube" : "Yappy";
}

function getPreviewUrl(option: QualityOption | undefined, data: ExtractVideoResponse) {
  return option?.url || data.videoUrl;
}

export function VideoResult({ data }: VideoResultProps) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState(data.downloadUrl);

  const selectedOption = useMemo(() => {
    return data.qualities.find((option) => option.downloadUrl === selectedUrl) ?? data.qualities[0];
  }, [data.qualities, selectedUrl]);

  useEffect(() => {
    setSelectedUrl(data.downloadUrl);
  }, [data.downloadUrl]);

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch {
      setCopiedUrl(null);
    }
  };

  const handleDownload = (url: string) => {
    window.open(url, "_blank");
  };

  const previewUrl = getPreviewUrl(selectedOption, data);
  const selectedDownloadUrl = selectedOption?.downloadUrl || data.downloadUrl;
  const selectedSourceType = selectedOption?.sourceType || "mp4";

  return (
    <Card className="w-full max-w-2xl mx-auto overflow-hidden border-2 shadow-xl animate-in fade-in zoom-in-95 duration-300">
      <CardContent className="p-0 flex flex-col md:flex-row">
        <div className="w-full md:w-2/5 bg-black relative flex items-center justify-center min-h-[220px] overflow-hidden">
          {selectedSourceType === "hls" && data.thumbnailUrl ? (
            <div className="relative w-full h-full min-h-[220px]">
              <img
                src={data.thumbnailUrl}
                alt={data.title || "Video thumbnail"}
                className="absolute inset-0 w-full h-full object-cover opacity-80"
              />
              <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center text-white text-center p-6">
                <RadioTower className="w-10 h-10 mb-3" />
                <p className="font-bold">HLS stream ready</p>
                <p className="text-sm text-white/75 mt-1">Preview depends on browser HLS support. Download converts to MP4.</p>
              </div>
            </div>
          ) : (
            <video 
              src={previewUrl} 
              poster={data.thumbnailUrl || undefined}
              controls
              className="w-full h-full object-contain max-h-[320px]"
              data-testid="video-preview-player"
            >
              Your browser does not support the video tag.
            </video>
          )}
        </div>

        <div className="p-6 w-full md:w-3/5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 text-primary px-3 py-1 text-xs font-bold uppercase tracking-wide" data-testid="text-result-platform">
                {getPlatformName(data.platform)} detected
              </span>
              <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-3 py-1 text-xs font-bold uppercase tracking-wide">
                {selectedSourceType === "hls" ? "HLS to MP4" : "Direct file"}
              </span>
            </div>
            <h3 className="font-semibold text-lg line-clamp-2" data-testid="text-video-title">
              {data.title || "Untitled Video"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1" data-testid="text-video-quality">
              Quality: {selectedOption?.quality || data.quality || "Best available"}
            </p>
          </div>

          {data.qualities.length > 1 && (
            <label className="space-y-2">
              <span className="text-sm font-bold text-muted-foreground">Quality options</span>
              <select
                value={selectedUrl}
                onChange={(event) => setSelectedUrl(event.target.value)}
                className="w-full h-11 rounded-xl border-2 border-input bg-card px-3 text-sm font-semibold outline-none focus:border-primary"
                data-testid="select-quality"
              >
                {data.qualities.map((option) => (
                  <option key={`${option.downloadUrl}-${option.label}`} value={option.downloadUrl}>
                    {option.label} {option.sourceType === "hls" ? "(MP4 conversion)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="space-y-3 pt-2">
            <div className="flex gap-2">
              <Button 
                onClick={() => handleDownload(selectedDownloadUrl)} 
                className="flex-1 font-bold shadow-sm"
                data-testid="button-download"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => copyToClipboard(selectedDownloadUrl)}
                data-testid="button-copy"
                title="Copy selected link"
              >
                {copiedUrl === selectedDownloadUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>

            <Button
              variant="secondary"
              className="w-full font-bold shadow-sm"
              onClick={() => copyToClipboard(previewUrl)}
              data-testid="button-copy-source"
            >
              {copiedUrl === previewUrl ? <Check className="w-4 h-4 mr-2" /> : <Video className="w-4 h-4 mr-2" />}
              Copy source link
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
