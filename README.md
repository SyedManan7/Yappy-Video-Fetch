# Yappy Video Downloader

A clean no-login web app for extracting video sources from public `yappy.media` and `rutube.ru` video pages, previewing them, choosing quality, copying the source link, and downloading the best available file.

## Features

- Paste one `yappy.media` or `rutube.ru` video URL into a single input
- Automatic platform detection
- Server-side page fetch and page JSON/player config parsing
- Yappy direct media extraction
- Rutube player data, stream, and HLS (`.m3u8`) extraction
- Quality options when multiple streams are available
- MP4 download for direct files and HLS-to-MP4 conversion route when needed
- Thumbnail and title detection when available
- Invalid, unsupported, private/restricted link handling
- Copy selected download link and source link buttons
- Dark/light UI toggle
- Mobile-friendly centered card layout

## Project Structure

```text
artifacts/yappy-video-downloader/  Frontend React/Vite app
artifacts/api-server/              Backend Express API
lib/api-spec/openapi.yaml          API contract
lib/api-client-react/              Generated frontend API hooks
lib/api-zod/                       Generated backend Zod validators
```

## Run Locally

Install dependencies:

```bash
pnpm install
```

Generate API types after API spec changes:

```bash
pnpm --filter @workspace/api-spec run codegen
```

Run the API server:

```bash
pnpm --filter @workspace/api-server run dev
```

Run the frontend:

```bash
pnpm --filter @workspace/yappy-video-downloader run dev
```

In Replit, the app is served through the preview at `/` and the backend is served at `/api`.

## API

### POST `/api/extract`

Request:

```json
{
  "url": "https://rutube.ru/video/..."
}
```

Success response:

```json
{
  "platform": "rutube",
  "videoUrl": "https://.../playlist.m3u8",
  "downloadUrl": "/api/convert?source=...",
  "hdVideoUrl": "https://.../playlist.m3u8",
  "thumbnailUrl": "https://.../thumbnail.jpg",
  "title": "Video title",
  "quality": "1080p",
  "qualities": [
    {
      "label": "1080p",
      "quality": "1080p",
      "url": "https://.../playlist.m3u8",
      "downloadUrl": "/api/convert?source=...",
      "sourceType": "hls",
      "width": 1920,
      "height": 1080
    }
  ]
}
```

Error response:

```json
{
  "error": "Unsupported link. Please use yappy.media or rutube.ru."
}
```

### GET `/api/convert`

Used internally for signed HLS-to-MP4 downloads when a Rutube source is only available as `.m3u8`. This requires `ffmpeg` on the server.

## Deployment

### Replit

Use the Deploy button in Replit. The frontend and backend are already configured for the workspace preview and deployment routing.

### Render

Deploy the API as a Node web service:

- Build command: `pnpm install && pnpm --filter @workspace/api-server run build`
- Start command: `pnpm --filter @workspace/api-server run start`
- Set `PORT` from Render's provided environment.
- Ensure `ffmpeg` is available if you want HLS-to-MP4 conversion downloads for Rutube streams.

Deploy the frontend as a static site:

- Build command: `pnpm install && pnpm --filter @workspace/yappy-video-downloader run build`
- Publish directory: `artifacts/yappy-video-downloader/dist/public`
- Configure the frontend domain or rewrite `/api/*` requests to the API service URL if frontend and API are deployed separately.

### Vercel

Deploy the frontend as a Vite static project:

- Framework preset: Vite
- Build command: `pnpm --filter @workspace/yappy-video-downloader run build`
- Output directory: `artifacts/yappy-video-downloader/dist/public`

Deploy the Express API separately on Render or another Node host, then configure Vercel rewrites or an environment-specific API base so `/api/extract` and `/api/convert` reach the backend.

## Important Note

This app extracts video URLs exposed in public page HTML, page JSON, player config, or public stream playlists. It does not bypass private content, authentication, DRM, or platform restrictions.
