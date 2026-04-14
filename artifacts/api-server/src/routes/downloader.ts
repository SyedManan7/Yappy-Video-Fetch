import { Router, type IRouter } from "express";
import { ExtractVideoBody, ExtractVideoResponse } from "@workspace/api-zod";

type ExtractedVideo = {
  videoUrl: string;
  downloadUrl: string;
  hdVideoUrl: string | null;
  thumbnailUrl: string | null;
  title: string | null;
  quality: string;
};

type Candidate = {
  url: string;
  score: number;
};

const router: IRouter = Router();

const YAPPY_HOST_PATTERN = /(^|\.)yappy\.media$/i;
const VIDEO_URL_PATTERN =
  /https?:\\?\/\\?\/[^"'\\\s<>]+?\.(?:mp4|mov|webm|m4v)(?:\?[^"'\\\s<>]*)?/gi;

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

function scoreVideoUrl(url: string): number {
  const lower = url.toLowerCase();
  let score = 1;

  if (lower.includes(".mp4")) score += 80;
  if (lower.includes("1080") || lower.includes("fullhd")) score += 40;
  if (lower.includes("720") || lower.includes("hd")) score += 25;
  if (lower.includes("480")) score += 10;
  if (lower.includes("watermark")) score -= 100;
  if (lower.includes("preview") || lower.includes("thumb")) score -= 15;

  return score;
}

function addCandidate(
  candidates: Map<string, Candidate>,
  rawUrl: string | null | undefined,
  baseUrl: URL,
  scoreBoost = 0,
): void {
  if (!rawUrl) return;

  const normalized = normalizeUrl(rawUrl, baseUrl);
  if (!normalized) return;

  if (!/\.(mp4|mov|webm|m4v)(?:\?|$)/i.test(normalized)) {
    return;
  }

  const score = scoreVideoUrl(normalized) + scoreBoost;
  const existing = candidates.get(normalized);

  if (!existing || score > existing.score) {
    candidates.set(normalized, { url: normalized, score });
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

function extractVideoData(html: string, pageUrl: URL): ExtractedVideo | null {
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
  while ((urlMatch = VIDEO_URL_PATTERN.exec(decodedHtml)) !== null) {
    addCandidate(candidates, urlMatch[0], pageUrl);
  }

  for (const body of extractJsonScriptBodies(html)) {
    try {
      collectFromJson(JSON.parse(body), pageUrl, candidates, thumbnails, titles);
    } catch {
      let scriptUrlMatch: RegExpExecArray | null;
      while ((scriptUrlMatch = VIDEO_URL_PATTERN.exec(body)) !== null) {
        addCandidate(candidates, scriptUrlMatch[0], pageUrl);
      }
    }
  }

  const sorted = [...candidates.values()].sort((a, b) => b.score - a.score);
  const best = sorted[0];

  if (!best) {
    return null;
  }

  const hd = sorted.find((candidate) =>
    /(?:1080|720|fullhd|hd)/i.test(candidate.url),
  );
  const selected = hd ?? best;

  return {
    videoUrl: best.url,
    downloadUrl: selected.url,
    hdVideoUrl: hd?.url ?? null,
    thumbnailUrl: thumbnails.values().next().value ?? null,
    title: titles.values().next().value ?? null,
    quality: hd ? "HD" : "Best available",
  };
}

router.post("/extract", async (req, res): Promise<void> => {
  const parsed = ExtractVideoBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Please paste a valid yappy.media video link." });
    return;
  }

  let pageUrl: URL;

  try {
    pageUrl = new URL(parsed.data.url);
  } catch {
    res.status(400).json({ error: "Please paste a valid yappy.media video link." });
    return;
  }

  if (!["http:", "https:"].includes(pageUrl.protocol) || !YAPPY_HOST_PATTERN.test(pageUrl.hostname)) {
    res.status(400).json({ error: "Only yappy.media video links are supported." });
    return;
  }

  try {
    const response = await fetch(pageUrl, {
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      req.log.warn({ status: response.status }, "Remote page fetch failed");
      res.status(502).json({ error: "Could not load that yappy.media page. Try checking the link." });
      return;
    }

    const html = await response.text();
    const extracted = extractVideoData(html, pageUrl);

    if (!extracted) {
      res.status(422).json({
        error: "No direct downloadable video source was found on that page.",
      });
      return;
    }

    res.json(ExtractVideoResponse.parse(extracted));
  } catch (error) {
    req.log.error({ err: error }, "Video extraction failed");
    res.status(502).json({ error: "The page could not be fetched right now. Please try again." });
  }
});

export default router;