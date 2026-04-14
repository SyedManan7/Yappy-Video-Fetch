import { spawn } from "node:child_process";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import axios from "axios";
import { ExtractVideoBody, ExtractVideoResponse } from "@workspace/api-zod";

type Platform = "yappy" | "rutube";
type SourceType = "mp4" | "hls";

type QualityOption = {
  label: string;
  quality: string;
  url: string;
  downloadUrl: string;
  sourceType: SourceType;
  width: number | null;
  height: number | null;
  fileSizeBytes: number | null;
  fileSizeLabel: string | null;
  recommended: boolean;
};

type ExtractedVideo = {
  platform: Platform;
  videoUrl: string;
  downloadUrl: string;
  hdVideoUrl: string | null;
  thumbnailUrl: string | null;
  title: string | null;
  quality: string;
  qualities: QualityOption[];
};

type Candidate = {
  url: string;
  score: number;
  sourceType: SourceType;
  width: number | null;
  height: number | null;
  label: string | null;
  fileSizeBytes: number | null;
};

type CandidateMetadata = {
  width?: number | null;
  height?: number | null;
  label?: string | null;
  fileSizeBytes?: number | null;
};

const router: IRouter = Router();

const YAPPY_HOST_PATTERN = /(^|\.)yappy\.media$/i;
const RUTUBE_HOST_PATTERN = /(^|\.)rutube\.ru$/i;
const MEDIA_URL_PATTERN =
  /https?:\\?\/\\?\/[^"'\\\s<>]+?\.(?:mp4|mov|webm|m4v|m3u8)(?:\?[^"'\\\s<>]*)?/gi;
const requestHeaders = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/");
}

function normalizeUrl(value: string, baseUrl: URL): string | null {
  const cleaned = decodeHtmlEntities(value).trim().replace(/^["']|["']$/g, "");

  if (!cleaned || cleaned.startsWith("blob:") || cleaned.startsWith("data:")) {
    return null;
  }

  try {
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return null;
  }
}

function getMetaContent(html: string, names: string[]): string | null {
  for (const name of names) {
    const propertyPattern = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    );
    const contentPattern = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["'][^>]*>`,
      "i",
    );
    const match = html.match(propertyPattern) ?? html.match(contentPattern);

    if (match?.[1]) {
      return decodeHtmlEntities(match[1]);
    }
  }

  return null;
}

function getSourceType(url: string): SourceType {
  return url.toLowerCase().includes(".m3u8") ? "hls" : "mp4";
}

function getResolution(url: string): { width: number | null; height: number | null } {
  const lower = url.toLowerCase();
  const heightMatch = lower.match(/(?:^|[^0-9])([1-9][0-9]{2,3})p(?:[^0-9]|$)/);
  if (heightMatch?.[1]) {
    return { width: null, height: Number(heightMatch[1]) };
  }

  const resolutionMatch = lower.match(/([1-9][0-9]{2,4})x([1-9][0-9]{2,4})/);
  if (resolutionMatch?.[1] && resolutionMatch[2]) {
    return { width: Number(resolutionMatch[1]), height: Number(resolutionMatch[2]) };
  }

  return { width: null, height: null };
}

function getResolutionFromText(value: string): { width: number | null; height: number | null } {
  const heightMatch = value.match(/(?:^|[^0-9])([1-9][0-9]{2,3})p(?:[^0-9]|$)/i);
  if (heightMatch?.[1]) {
    return { width: null, height: Number(heightMatch[1]) };
  }

  const resolutionMatch = value.match(/([1-9][0-9]{2,4})x([1-9][0-9]{2,4})/i);
  if (resolutionMatch?.[1] && resolutionMatch[2]) {
    return { width: Number(resolutionMatch[1]), height: Number(resolutionMatch[2]) };
  }

  return { width: null, height: null };
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }

  return null;
}

function formatBytes(value: number | null): string | null {
  if (!value) return null;

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

function metadataFromObject(value: Record<string, unknown>): CandidateMetadata {
  let width: number | null = null;
  let height: number | null = null;
  let label: string | null = null;
  let fileSizeBytes: number | null = null;

  for (const [key, entry] of Object.entries(value)) {
    const lowerKey = key.toLowerCase();

    if (["width", "w"].includes(lowerKey)) {
      width = parsePositiveInteger(entry) ?? width;
    }

    if (["height", "h"].includes(lowerKey)) {
      height = parsePositiveInteger(entry) ?? height;
    }

    if (
      lowerKey.includes("size") ||
      lowerKey.includes("filesize") ||
      lowerKey.includes("file_size") ||
      lowerKey.includes("contentlength")
    ) {
      fileSizeBytes = parsePositiveInteger(entry) ?? fileSizeBytes;
    }

    if (typeof entry === "string") {
      const textResolution = getResolutionFromText(entry);
      width = width ?? textResolution.width;
      height = height ?? textResolution.height;

      if (
        lowerKey.includes("quality") ||
        lowerKey.includes("resolution") ||
        lowerKey.includes("label") ||
        lowerKey.includes("name")
      ) {
        label = entry;
      }
    }
  }

  if (!label && height) {
    label = `${height}p`;
  }

  return { width, height, label, fileSizeBytes };
}

function scoreVideoUrl(url: string, sourceType = getSourceType(url)): number {
  const lower = url.toLowerCase();
  let score = sourceType === "mp4" ? 100 : 60;

  if (lower.includes("1080") || lower.includes("fullhd")) score += 40;
  if (lower.includes("720") || lower.includes("hd")) score += 25;
  if (lower.includes("480")) score += 10;
  if (lower.includes("watermark")) score -= 100;
  if (lower.includes("preview") || lower.includes("thumb")) score -= 15;

  const { height } = getResolution(url);
  if (height) score += height / 20;

  return score;
}

function signSource(source: string): string {
  const secret = process.env.SESSION_SECRET ?? "development-only-yappy-downloader";
  return createHmac("sha256", secret).update(source).digest("hex");
}

function isValidSignature(source: string, sig: string): boolean {
  const expected = signSource(source);
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(sig, "hex");

  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function getDownloadUrl(url: string, sourceType: SourceType): string {
  if (sourceType === "mp4") {
    return url;
  }

  const params = new URLSearchParams({ source: url, sig: signSource(url) });
  return `/api/convert?${params.toString()}`;
}

function makeQualityLabel(candidate: Candidate): string {
  if (candidate.label) return candidate.label;
  if (candidate.height) return `${candidate.height}p`;
  if (candidate.sourceType === "hls") return "HLS stream";
  return "Direct MP4";
}

function toQualityOption(candidate: Candidate, recommended: boolean): QualityOption {
  const label = makeQualityLabel(candidate);
  return {
    label,
    quality: label,
    url: candidate.url,
    downloadUrl: getDownloadUrl(candidate.url, candidate.sourceType),
    sourceType: candidate.sourceType,
    width: candidate.width,
    height: candidate.height,
    fileSizeBytes: candidate.fileSizeBytes,
    fileSizeLabel: formatBytes(candidate.fileSizeBytes),
    recommended,
  };
}

function addCandidate(
  candidates: Map<string, Candidate>,
  rawUrl: string | null | undefined,
  baseUrl: URL,
  scoreBoost = 0,
  metadata: CandidateMetadata = {},
): void {
  if (!rawUrl) return;

  const normalized = normalizeUrl(rawUrl, baseUrl);
  if (!normalized) return;

  if (!/\.(mp4|mov|webm|m4v|m3u8)(?:\?|$)/i.test(normalized)) {
    return;
  }

  const sourceType = getSourceType(normalized);
  const detectedResolution = getResolution(normalized);
  const width = metadata.width ?? detectedResolution.width;
  const height = metadata.height ?? detectedResolution.height;
  const score = scoreVideoUrl(normalized, sourceType) + scoreBoost;
  const existing = candidates.get(normalized);

  if (!existing || score > existing.score) {
    candidates.set(normalized, {
      url: normalized,
      score,
      sourceType,
      width,
      height,
      label: metadata.label ?? (height ? `${height}p` : null),
      fileSizeBytes: metadata.fileSizeBytes ?? null,
    });
  }
}

function collectFromJson(
  value: unknown,
  baseUrl: URL,
  candidates: Map<string, Candidate>,
  thumbnails: Set<string>,
  titles: Set<string>,
): void {
  if (!value) return;

  if (typeof value === "string") {
    addCandidate(candidates, value, baseUrl);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectFromJson(item, baseUrl, candidates, thumbnails, titles);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();

    if (typeof entry === "string") {
      if (
        lowerKey.includes("video") ||
        lowerKey.includes("contenturl") ||
        lowerKey.includes("download") ||
        lowerKey.includes("m3u8") ||
        lowerKey.includes("hls") ||
        lowerKey === "src" ||
        lowerKey === "url"
      ) {
        addCandidate(candidates, entry, baseUrl, 10);
      }

      if (lowerKey.includes("thumbnail") || lowerKey.includes("poster") || lowerKey.includes("image")) {
        const thumbnailUrl = normalizeUrl(entry, baseUrl);
        if (thumbnailUrl) thumbnails.add(thumbnailUrl);
      }

      if ((lowerKey === "title" || lowerKey === "name") && entry.trim()) {
        titles.add(entry.trim());
      }
    }

    collectFromJson(entry, baseUrl, candidates, thumbnails, titles);
  }
}

function extractJsonScriptBodies(html: string): string[] {
  const bodies: string[] = [];
  const scriptPattern = /<script[^>]*(?:type=["']application\/(?:ld\+)?json["']|id=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptPattern.exec(html)) !== null) {
    if (match[1]) bodies.push(decodeHtmlEntities(match[1].trim()));
  }

  return bodies;
}

function buildExtractedVideo(
  platform: Platform,
  candidates: Map<string, Candidate>,
  thumbnails: Set<string>,
  titles: Set<string>,
): ExtractedVideo | null {
  const sorted = [...candidates.values()].sort((a, b) => b.score - a.score);
  const best = sorted[0];

  if (!best) return null;

  const qualities = sorted.map(toQualityOption);
  const bestQuality = qualities[0];
  const hd = sorted.find((candidate) => candidate.height ? candidate.height >= 720 : /(?:1080|720|fullhd|hd)/i.test(candidate.url));
  const hdOption = hd ? toQualityOption(hd) : null;

  return {
    platform,
    videoUrl: best.url,
    downloadUrl: bestQuality.downloadUrl,
    hdVideoUrl: hdOption?.url ?? null,
    thumbnailUrl: thumbnails.values().next().value ?? null,
    title: titles.values().next().value ?? null,
    quality: bestQuality.quality,
    qualities,
  };
}

function extractYappyVideoData(html: string, pageUrl: URL): ExtractedVideo | null {
  const candidates = new Map<string, Candidate>();
  const thumbnails = new Set<string>();
  const titles = new Set<string>();

  for (const metaName of ["og:video", "og:video:url", "og:video:secure_url", "twitter:player:stream"]) {
    addCandidate(candidates, getMetaContent(html, [metaName]), pageUrl, 30);
  }

  const thumbnail = getMetaContent(html, ["og:image", "twitter:image", "thumbnail"]);
  if (thumbnail) {
    const normalizedThumbnail = normalizeUrl(thumbnail, pageUrl);
    if (normalizedThumbnail) thumbnails.add(normalizedThumbnail);
  }

  const title = getMetaContent(html, ["og:title", "twitter:title"]);
  if (title) titles.add(title);

  const mediaTagPattern = /<(?:video|source)[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let mediaTagMatch: RegExpExecArray | null;
  while ((mediaTagMatch = mediaTagPattern.exec(html)) !== null) {
    addCandidate(candidates, mediaTagMatch[1], pageUrl, 20);
  }

  const posterPattern = /<video[^>]+poster=["']([^"']+)["'][^>]*>/gi;
  let posterMatch: RegExpExecArray | null;
  while ((posterMatch = posterPattern.exec(html)) !== null) {
    const normalizedPoster = posterMatch[1] ? normalizeUrl(posterMatch[1], pageUrl) : null;
    if (normalizedPoster) thumbnails.add(normalizedPoster);
  }

  const decodedHtml = decodeHtmlEntities(html);
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = MEDIA_URL_PATTERN.exec(decodedHtml)) !== null) {
    addCandidate(candidates, urlMatch[0], pageUrl);
  }

  for (const body of extractJsonScriptBodies(html)) {
    try {
      collectFromJson(JSON.parse(body), pageUrl, candidates, thumbnails, titles);
    } catch {
      let scriptUrlMatch: RegExpExecArray | null;
      while ((scriptUrlMatch = MEDIA_URL_PATTERN.exec(body)) !== null) {
        addCandidate(candidates, scriptUrlMatch[0], pageUrl);
      }
    }
  }

  return buildExtractedVideo("yappy", candidates, thumbnails, titles);
}

function getRutubeId(pageUrl: URL, html: string): string | null {
  const directMatch = pageUrl.pathname.match(/\/(?:video|shorts|play\/embed)\/([a-f0-9-]{16,})/i);
  if (directMatch?.[1]) return directMatch[1];

  const htmlMatch = html.match(/(?:videoId|video_id|videoIdHash|id)["']?\s*[:=]\s*["']([a-f0-9-]{16,})["']/i);
  return htmlMatch?.[1] ?? null;
}

async function addM3u8Variants(masterUrl: string, candidates: Map<string, Candidate>, baseUrl: URL): Promise<void> {
  try {
    const response = await axios.get<string>(masterUrl, {
      headers: requestHeaders,
      responseType: "text",
      timeout: 15000,
    });
    const lines = response.data.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.startsWith("#EXT-X-STREAM-INF")) continue;

      const nextLine = lines[index + 1];
      if (!nextLine || nextLine.startsWith("#")) continue;

      const resolutionMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
      const width = resolutionMatch?.[1] ? Number(resolutionMatch[1]) : null;
      const height = resolutionMatch?.[2] ? Number(resolutionMatch[2]) : null;
      const label = height ? `${height}p` : "HLS stream";
      addCandidate(candidates, nextLine, new URL(masterUrl), 50 + (height ?? 0) / 10, label, { width, height });
    }
  } catch {
    addCandidate(candidates, masterUrl, baseUrl, 20, "HLS stream");
  }
}

async function extractRutubeVideoData(html: string, pageUrl: URL): Promise<ExtractedVideo | null> {
  const candidates = new Map<string, Candidate>();
  const thumbnails = new Set<string>();
  const titles = new Set<string>();

  const title = getMetaContent(html, ["og:title", "twitter:title"]);
  if (title) titles.add(title);

  const thumbnail = getMetaContent(html, ["og:image", "twitter:image", "thumbnail"]);
  if (thumbnail) {
    const normalizedThumbnail = normalizeUrl(thumbnail, pageUrl);
    if (normalizedThumbnail) thumbnails.add(normalizedThumbnail);
  }

  for (const body of extractJsonScriptBodies(html)) {
    try {
      collectFromJson(JSON.parse(body), pageUrl, candidates, thumbnails, titles);
    } catch {
      let scriptUrlMatch: RegExpExecArray | null;
      while ((scriptUrlMatch = MEDIA_URL_PATTERN.exec(body)) !== null) {
        addCandidate(candidates, scriptUrlMatch[0], pageUrl);
      }
    }
  }

  let urlMatch: RegExpExecArray | null;
  const decodedHtml = decodeHtmlEntities(html);
  while ((urlMatch = MEDIA_URL_PATTERN.exec(decodedHtml)) !== null) {
    addCandidate(candidates, urlMatch[0], pageUrl);
  }

  const videoId = getRutubeId(pageUrl, html);
  if (videoId) {
    const apiUrls = [
      `https://rutube.ru/api/play/options/${videoId}/?format=json`,
      `https://rutube.ru/api/video/${videoId}/`,
    ];

    for (const apiUrl of apiUrls) {
      try {
        const response = await axios.get<unknown>(apiUrl, {
          headers: { ...requestHeaders, accept: "application/json,text/plain,*/*" },
          timeout: 15000,
        });
        collectFromJson(response.data, new URL(apiUrl), candidates, thumbnails, titles);
      } catch {
        continue;
      }
    }
  }

  const hlsCandidates = [...candidates.values()].filter((candidate) => candidate.sourceType === "hls");
  await Promise.all(hlsCandidates.map((candidate) => addM3u8Variants(candidate.url, candidates, pageUrl)));

  return buildExtractedVideo("rutube", candidates, thumbnails, titles);
}

function getPlatform(pageUrl: URL): Platform | null {
  if (YAPPY_HOST_PATTERN.test(pageUrl.hostname)) return "yappy";
  if (RUTUBE_HOST_PATTERN.test(pageUrl.hostname)) return "rutube";
  return null;
}

router.get("/convert", (req, res): void => {
  const source = typeof req.query.source === "string" ? req.query.source : "";
  const sig = typeof req.query.sig === "string" ? req.query.sig : "";

  if (!source || !sig || !isValidSignature(source, sig)) {
    res.status(400).json({ error: "Invalid conversion link." });
    return;
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(source);
  } catch {
    res.status(400).json({ error: "Invalid stream URL." });
    return;
  }

  if (!sourceUrl.protocol.startsWith("http")) {
    res.status(400).json({ error: "Invalid stream URL." });
    return;
  }

  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Disposition", 'attachment; filename="rutube-video.mp4"');

  const ffmpeg = spawn("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-headers",
    `User-Agent: ${requestHeaders["user-agent"]}\r\n`,
    "-i",
    source,
    "-c",
    "copy",
    "-bsf:a",
    "aac_adtstoasc",
    "-movflags",
    "frag_keyframe+empty_moov",
    "-f",
    "mp4",
    "pipe:1",
  ]);

  ffmpeg.stdout.pipe(res);
  ffmpeg.stderr.on("data", (chunk: Buffer) => {
    req.log.warn({ ffmpeg: chunk.toString() }, "HLS conversion warning");
  });
  ffmpeg.on("error", (error) => {
    req.log.error({ err: error }, "HLS conversion failed to start");
    if (!res.headersSent) {
      res.status(500).json({ error: "Video conversion is not available on this server." });
    }
  });
  ffmpeg.on("close", (code) => {
    if (code && code !== 0) {
      req.log.warn({ code }, "HLS conversion exited with non-zero status");
    }
  });
  req.on("close", () => {
    ffmpeg.kill("SIGTERM");
  });
});

router.post("/extract", async (req, res): Promise<void> => {
  const parsed = ExtractVideoBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Please paste a valid yappy.media or rutube.ru video link." });
    return;
  }

  let pageUrl: URL;

  try {
    pageUrl = new URL(parsed.data.url);
  } catch {
    res.status(400).json({ error: "Please paste a valid yappy.media or rutube.ru video link." });
    return;
  }

  if (!["http:", "https:"].includes(pageUrl.protocol)) {
    res.status(400).json({ error: "Please paste a valid web link." });
    return;
  }

  const platform = getPlatform(pageUrl);
  if (!platform) {
    res.status(400).json({ error: "Unsupported link. Please use yappy.media or rutube.ru." });
    return;
  }

  try {
    const response = await axios.get<string>(pageUrl.toString(), {
      headers: requestHeaders,
      responseType: "text",
      maxRedirects: 5,
      timeout: 20000,
      validateStatus: (status) => status < 500,
    });

    if (response.status === 401 || response.status === 403) {
      res.status(403).json({ error: "This video appears to be private or restricted." });
      return;
    }

    if (response.status >= 400) {
      req.log.warn({ status: response.status, platform }, "Remote page fetch failed");
      res.status(502).json({ error: "Could not load that video page. Try checking the link." });
      return;
    }

    const html = response.data;
    const extracted = platform === "yappy"
      ? extractYappyVideoData(html, pageUrl)
      : await extractRutubeVideoData(html, pageUrl);

    if (!extracted) {
      res.status(422).json({
        error: platform === "rutube"
          ? "No downloadable Rutube stream was found. The video may be private or restricted."
          : "No direct downloadable video source was found on that page.",
      });
      return;
    }

    res.json(ExtractVideoResponse.parse(extracted));
  } catch (error) {
    req.log.error({ err: error, platform }, "Video extraction failed");
    res.status(502).json({ error: "The page could not be fetched right now. Please try again." });
  }
});

export default router;
