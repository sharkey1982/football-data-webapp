# Football Data Webapp -- Setup & Deployment

This is the React/Vite frontend that reads from the same Supabase database the
importer project writes to. It only ever uses the **publishable key** -- never
the secret key -- since this code ships to the browser.

## Local development

```
npm install
```

Copy the env template and fill in your real values:

```
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase project URL and **publishable** key
(Settings -> API Keys in the Supabase dashboard -- the `sb_publishable_...`
one, not `sb_secret_...`).

Then run the dev server:

```
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

## Building for production

```
npm run build
```

Output goes to `dist/`. You can preview the production build locally with:

```
npm run preview
```

## Deploying to Netlify

Same pattern as your other Netlify projects:

1. Push this folder to its own GitHub repo (or a subfolder of one, with the
   base directory set accordingly in Netlify's build settings).
2. In Netlify: **Add a new site -> Import an existing project -> GitHub**,
   pick the repo.
3. Build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Add environment variables in Netlify (Site settings -> Environment
   variables), matching your `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

   Or via the CLI:
   ```
   npx netlify env:set VITE_SUPABASE_URL "https://your-project-ref.supabase.co"
   ```
   ```
   npx netlify env:set VITE_SUPABASE_PUBLISHABLE_KEY "sb_publishable_xxxxx"
   ```
5. Trigger a deploy. Netlify will rebuild automatically on every push to
   your main branch from here on.

## Project structure

```
src/
  lib/
    supabase.ts   -- Supabase client (publishable key only)
    api.ts        -- every database query the pages use
  types/
    database.ts   -- TypeScript types matching the schema (copy of the
                     importer project's version -- keep these in sync if
                     the schema changes, or switch both to CLI-generated types)
  components/
    AppLayout.tsx -- nav shell, used by every route
    ScoreChip.tsx -- the "teleprinter" scoreline + form-badge components
  pages/
    Dashboard.tsx
    MatchExplorer.tsx
    TeamExplorer.tsx
    LeagueExplorer.tsx
    PredictionCentre.tsx
scripts/
  test-joins.ts   -- one-off diagnostic for the PostgREST join queries;
                     not part of the app, just useful if a query ever
                     starts failing and you want to isolate why
```

## Notes on the Prediction Centre

The win/draw/loss percentages and expected goals shown there are a
**simple statistical baseline** (recent scoring rate + head-to-head history +
a fixed home-advantage adjustment) -- not a trained model. This matches the
brief's near-term scope; a proper model (accounting for player availability,
form trends, etc.) is listed as future work. The page is intentionally
explicit about this limitation in its own UI so it doesn't read as more
authoritative than it is.

## Keeping the database types in sync

`src/types/database.ts` here and in the importer project are currently
hand-written and manually duplicated. If you add a new migration that changes
the schema, update both copies, or better, switch to the CLI-generated
version everywhere:

```
npx supabase gen types typescript --linked --schema public > src/types/database.ts
```
