# web-marketing

Marrow's marketing site — separate Next.js app from the product app in `web/`.

## Routes

- `/` — Landing page (#96)

The `Deploy On-prem` CTA links to `/docs/install` (placeholder, lands in a later
issue).

## Dev

```bash
cd web-marketing
npm install
npm run dev   # http://localhost:3001
```

## Notes

- Header/footer in `components/marketing-chrome.tsx` are placeholders. The
  shared chrome from #95 will replace them; the landing page consumes them
  through that single import so the swap is local.
- The Fraunces font file is shared with the product app at
  `../web/public/fonts/Fraunces.ttf`.
