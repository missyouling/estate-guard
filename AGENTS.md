# AGENTS.md — OpenCode Agent Configuration

## Project Identity

- **Name:** 物业服务监督系统 (Property Supervision System)
- **Type:** Full-stack web application + WeChat Mini Program
- **Backend:** Fastify 5 + TypeScript + SQLite + Docker
- **Frontend:** React 19 + Vite 6 + Tailwind CSS
- **Mini Program:** WeChat Native (WXML/WXSS/TypeScript)

---

## Agent Instructions

### Always Follow These Rules

1. **File conventions:** All backend TypeScript files use `import`/`export` ES module syntax. `tsconfig.json` has `"moduleResolution": "bundler"`.

2. **Route file pattern:** Each route file in `backend/src/routes/` exports a default async function `(app: FastifyInstance) => Promise<void>`. Routes are registered in `backend/src/index.ts` via `await app.register(...)`.

3. **Auth:** JWT-based. `@fastify/jwt` plugin verifies tokens. Route hooks call `req.jwtVerify()`. Admin-only routes check `req.user.role === 'admin'`.

4. **Database:** Drizzle ORM with `better-sqlite3`. Schema in `backend/src/db/schema.ts`. Use `getDb()` from `backend/src/db/index.ts` to get the client.

5. **Encryption:** Identity card numbers and phone numbers are AES-256-GCM encrypted in the database. Use `encrypt()` / `decrypt()` from `backend/src/services/crypto.ts`.

6. **Frontend style:** Apple-inspired design. Glass morphism (`backdrop-filter: blur(40px) saturate(180%)`). `#007AFF` primary color. `#f5f5f7` background. Font: `-apple-system, "SF Pro Display"`.

7. **Mini Program:** Each page has 4 files (`.wxml`, `.wxss`, `.ts`, `.json`). Uses standard WeChat APIs. Shares same backend API.

8. **Error handling:** All API responses use `{ code: 0, message: "ok", data: ... }` format. Use `success()` and `fail()` from `backend/src/utils/response.ts`.

9. **No comments:** Do not add code comments unless the user explicitly asks.

10. **TypeScript strict:** `tsconfig.json` has `"strict": true`. Always type parameters and return types.

### Verification Checklist

When making changes, verify:

- [ ] `tsc --noEmit` passes in `backend/`
- [ ] `tsc --noEmit` passes in `web/`
- [ ] All routes have proper JWT auth guards
- [ ] Admin-only routes check `role === 'admin'`
- [ ] Sensitive fields (id_card, phone) are encrypted before DB write
- [ ] Frontend type definitions match backend API responses
- [ ] API responses use `success()`/`fail()` wrappers

### Known Patterns

#### Adding a new API route

1. Create route file in `backend/src/routes/` following existing pattern
2. Export default async function
3. Register in `backend/src/index.ts`
4. Add corresponding frontend API call in `web/src/lib/api.ts` (if needed)
5. Update type definitions in both `backend/src/types/` and `web/src/types/`

#### Adding a new frontend page

1. Create component in `web/src/pages/`
2. Add route in `web/src/router.tsx`
3. Add sidebar/nav link if applicable

#### Adding a new mini program page

1. Create 4 files per page: `.wxml`, `.wxss`, `.ts`, `.json`
2. Register in `miniapp/app.json` `pages` array
3. Shared utilities in `miniapp/utils/`

### Common Commands

```bash
# Backend dev
cd backend && npm run dev

# Database operations
cd backend && npm run db:migrate
cd backend && npm run db:seed
cd backend && npm run db:studio

# Frontend dev
cd web && npm run dev

# Production build
cd web && npm run build  # outputs to backend/public/

# Docker
docker compose up -d --build
docker compose logs -f
```

### Architecture Notes

- **Storage abstraction:** `getStorage()` returns either `LocalStorage` or `S3Storage`. Configured via `storage_backend` config key.
- **Image processing:** Images are auto-processed on upload (resize + JPEG + optional SVG watermark overlay).
- **Video processing:** Videos are uploaded first, then ffmpeg runs asynchronously via `child_process.spawn`.
- **Email:** Uses nodemailer. SMTP config is stored in the `configs` table (editable via admin panel).
- **Frontend proxy:** Vite dev server proxies `/api` and `/files` to `http://localhost:3000`.
- **Build output:** `web/vite.config.ts` builds to `../backend/public/` so the Fastify server serves both API and SPA.

### Reserved Config Keys

All config keys stored in `configs` table:

| Group | Keys |
|-------|------|
| Upload limits | `upload_max_image_size_mb`, `upload_max_video_size_mb`, `upload_max_audio_size_mb`, `upload_max_count_per_batch` |
| File formats | `allowed_image_types`, `allowed_video_types`, `allowed_audio_types`, `allowed_document_types` |
| Image processing | `image_compress_max_width`, `image_compress_quality`, `watermark_template`, `watermark_position`, `watermark_font_size`, `watermark_opacity`, `watermark_auto_apply`, `watermark_show_bg`, `watermark_text_color`, `watermark_font_weight`, `watermark_date_format`, `watermark_record_prefix`, `watermark_record_digits`, `watermark_record_suffix` |
| Video processing | `video_transcode_max_width`, `video_transcode_bitrate` |
| Email (SMTP) | `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `mail_from`, `verify_code_expire_minutes` |
| SMS | `sms_provider`, `sms_access_key`, `sms_secret_key`, `sms_sign_name`, `sms_template_code` |
| Geocoding | `geocode_provider`, `geocode_api_key` |
| Storage | `storage_backend`, `s3_endpoint`, `s3_bucket`, `s3_access_key`, `s3_secret_key`, `s3_region` |
