# Vendored driver headshots

Driver headshots are downloaded from the OpenF1 `headshot_url` (F1's official CDN) into `public/drivers/` at snapshot time and served locally, with an initials fallback when a photo is missing. Hotlinking is banned: a silent CDN path change would otherwise break images at runtime with no build signal. Redistributing F1-copyrighted photos is legally greyer than hotlinking; if that becomes a concern, fall back to initials + team-colour discs.
