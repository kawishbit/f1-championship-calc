// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Pages render on demand and Vercel caches the HTML (ISR). Each page sets its own
// `Cache-Control: s-maxage` (see src/lib/snapshot.ts cacheSeconds); `expiration` is the 3-day ceiling.
// https://astro.build/config
export default defineConfig({
  adapter: vercel({
    isr: { expiration: 60 * 60 * 24 * 3 },
  }),
});
