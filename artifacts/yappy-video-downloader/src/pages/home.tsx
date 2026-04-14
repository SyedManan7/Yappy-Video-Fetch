import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link2, AlertCircle, Loader2 } from "lucide-react";

import { useExtractVideo } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ThemeToggle } from "@/components/theme-toggle";
import { VideoResult } from "@/components/video-result";

const formSchema = z.object({
  url: z.string().url({ message: "Please enter a valid URL." }).refine((value) => {
    try {
      const hostname = new URL(value).hostname.toLowerCase();
      return hostname === "yappy.media" || hostname.endsWith(".yappy.media") || hostname === "rutube.ru" || hostname.endsWith(".rutube.ru");
    } catch {
      return false;
    }
  }, { message: "Use a yappy.media or rutube.ru link." }),
});

function detectPlatformLabel(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname === "yappy.media" || hostname.endsWith(".yappy.media")) return "Yappy detected";
    if (hostname === "rutube.ru" || hostname.endsWith(".rutube.ru")) return "Rutube detected";
  } catch {
    return null;
  }
  return null;
}

export default function Home() {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      url: "",
    },
  });

  const extractVideoMutation = useExtractVideo();
  const watchedUrl = form.watch("url");
  const detectedLabel = useMemo(() => detectPlatformLabel(watchedUrl), [watchedUrl]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    setErrorMsg(null);
    extractVideoMutation.mutate(
      { data: { url: values.url } },
      {
        onError: (error) => {
          const apiError = error as { data?: { error?: string }; response?: { data?: { error?: string } }; message?: string };
          const msg = apiError?.data?.error || apiError?.response?.data?.error || apiError.message || "An unexpected error occurred.";
          setErrorMsg(msg);
        },
      }
    );
  };

  const isLoading = extractVideoMutation.isPending;

  return (
    <div className="min-h-screen w-full flex flex-col bg-background text-foreground transition-colors selection:bg-primary selection:text-primary-foreground">
      <header className="w-full max-w-4xl mx-auto p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-xl rotate-12 flex items-center justify-center shadow-sm">
            <div className="w-3 h-3 bg-white rounded-full -rotate-12" />
          </div>
          <span className="font-bold text-xl tracking-tight hidden sm:inline-block">Yappy<span className="text-primary">Downloader</span></span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex-1 flex flex-col items-center justify-start pt-16 md:pt-24 px-4 pb-20 w-full max-w-4xl mx-auto gap-12">
        <div className="w-full text-center space-y-4">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-balance">
            Get your videos.<br />
            <span className="text-primary underline decoration-4 underline-offset-4">Fast and clean.</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Paste a yappy.media or rutube.ru link below to extract the best available video file. No login, just raw media when the page exposes it.
          </p>
        </div>

        <div className="w-full max-w-2xl mx-auto">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="relative flex items-center">
                        <div className="absolute left-4 text-muted-foreground pointer-events-none">
                          <Link2 className="w-6 h-6" />
                        </div>
                        <Input 
                          placeholder="https://yappy.media/... or https://rutube.ru/video/..." 
                          className="pl-12 pr-32 h-16 md:h-20 text-lg md:text-xl rounded-2xl border-4 border-input focus-visible:ring-0 focus-visible:border-primary shadow-sm bg-card transition-all"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck="false"
                          data-testid="input-video-url"
                          {...field} 
                        />
                        <Button 
                          type="submit" 
                          size="lg"
                          disabled={isLoading}
                          className="absolute right-2 h-12 md:h-16 px-6 md:px-8 rounded-xl font-bold text-lg shadow-sm"
                          data-testid="button-extract"
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                              Loading
                            </>
                          ) : (
                            "Extract"
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <div className="min-h-7 mt-2 flex items-center justify-center">
                      <FormMessage className="text-base text-center font-medium" />
                      {!form.formState.errors.url && detectedLabel && (
                        <span className="text-sm font-bold uppercase tracking-wide text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1" data-testid="text-detected-platform">
                          {detectedLabel}
                        </span>
                      )}
                    </div>
                  </FormItem>
                )}
              />
            </form>
          </Form>

          {errorMsg && (
            <Alert variant="destructive" className="mt-6 border-2 animate-in slide-in-from-top-2">
              <AlertCircle className="h-5 w-5" />
              <AlertTitle className="font-bold text-lg">Extraction failed</AlertTitle>
              <AlertDescription className="text-base">
                {errorMsg}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {extractVideoMutation.data && !errorMsg && (
          <div className="w-full animate-in slide-in-from-bottom-8 duration-500 fade-in">
            <VideoResult data={extractVideoMutation.data} />
          </div>
        )}

      </main>
      
      <footer className="py-6 text-center text-muted-foreground text-sm">
        Built for speed. Not affiliated with yappy.media or rutube.ru.
      </footer>
    </div>
  );
}
