# Yappy Video Downloader

A clean no-login web app for extracting a direct video file from a public `yappy.media` video page, previewing it, copying the direct link, and downloading the best available file.

## Features

- Paste a `yappy.media` video URL
- Server-side page fetch and direct video source extraction
- MP4/direct media preview before download
- Download button using the best or HD URL when available
- Thumbnail and title detection when available
- Invalid link detection and friendly errors
- Copy direct video link button
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
  "url": "https://yappy.media/..."
}
```

Success response:

```json
{
  "videoUrl": "https://.../video.mp4",
  "downloadUrl": "https://.../video.mp4",
  "hdVideoUrl": null,
  "thumbnailUrl": "https://.../thumbnail.jpg",
  "title": "Video title",
  "quality": "Best available"
}
```

Error response:

```json
{
  "error": "Only yappy.media video links are supported."
}
```

## Deployment

### Replit

Use the Deploy button in Replit. The frontend and backend are already configured for the workspace preview and deployment routing.

### Render

Deploy the API as a Node web service:

- Build command: `pnpm install && pnpm --filter @workspace/api-server run build`
- Start command: `pnpm --filter @workspace/api-server run start`
- Set `PORT` from Render's provided environment.

Deploy the frontend as a static site:

- Build command: `pnpm install && pnpm --filter @workspace/yappy-video-downloader run build`
- Publish directory: `artifacts/yappy-video-downloader/dist/public`
- Configure the frontend domain or rewrite `/api/*` requests to the API service URL if frontend and API are deployed separately.

### Vercel

Deploy the frontend as a Vite static project:

- Framework preset: Vite
- Build command: `pnpm --filter @workspace/yappy-video-downloader run build`
- Output directory: `artifacts/yappy-video-downloader/dist/public`

Deploy the Express API separately on Render or another Node host, then configure Vercel rewrites or an environment-specific API base so `/api/extract` reaches the backend.

## Important Note

This app extracts direct video URLs exposed in public page HTML or page data. It does not bypass private content, authentication, DRM, or platform restrictions.
