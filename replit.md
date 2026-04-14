# Workspace

## Overview

pnpm workspace monorepo using TypeScript. The primary user-facing app is **Yappy Video Downloader**, a no-login web utility that accepts a yappy.media video page URL, calls the shared Express API, extracts a direct video file URL from the remote page HTML, and returns preview/download metadata.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS
- **API framework**: Express 5
- **Validation**: Zod (`zod/v4`), generated from OpenAPI
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild for API, Vite for frontend

## Artifacts

- `artifacts/yappy-video-downloader` — React/Vite frontend at `/`
- `artifacts/api-server` — Express backend at `/api`
- `artifacts/mockup-sandbox` — canvas/component preview sandbox at `/__mockup`

## Yappy Video Downloader

### User Flow

1. User pastes a yappy.media video page URL.
2. Frontend posts the URL to `POST /api/extract`.
3. Backend fetches the remote HTML, validates the host, extracts direct media candidates from meta tags, video/source tags, JSON script data, and embedded media URLs.
4. Backend returns the best available direct video URL, HD URL when detected, thumbnail when available, title when available, and quality label.
5. Frontend shows status, preview player, thumbnail fallback, download button, copy direct link button, and dark/light toggle.

### API Contract

The OpenAPI spec is in `lib/api-spec/openapi.yaml` and includes:

- `GET /api/healthz`
- `POST /api/extract`

Run codegen after editing the spec:

```bash
pnpm --filter @workspace/api-spec run codegen
```

## Key Commands

- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/yappy-video-downloader run dev` — run frontend locally
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/api-server run build` — build API server
- `pnpm --filter @workspace/yappy-video-downloader run build` — build frontend

## Notes

- The downloader does not bypass private, authenticated, or DRM-protected content. It extracts direct media URLs that are present in the public page data.
- The backend intentionally rejects non-yappy.media hosts.
- No database is required for this app.
