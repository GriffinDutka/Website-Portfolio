# Griffin Dutka — Portfolio

Personal site for Griffin Dutka, AI security engineer in Chicago.

Static site: one HTML page, one stylesheet, one small vanilla JS file
(`src/main.js`) for the pipeline walkthrough and the copy-email button. No
build step and no frameworks. The page reads completely with JavaScript off.

Type is Big Shoulders Display (Chicago's civic typeface), Public Sans, and
Red Hat Mono from Google Fonts. Light and dark themes follow the visitor's
system setting.

## Local preview

Any static file server works, e.g.:

```bash
python3 -m http.server 3333
```

Then open http://localhost:3333

## Deploy

Hosted on Cloudflare. Pushing to `main` triggers an automatic deploy.

- **Framework preset:** None
- **Build command:** (none)
- **Build output directory:** `/`
