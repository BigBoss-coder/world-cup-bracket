# World Cup Bracket

Free MVP for a friends bracket pool.

## What is included

- No-password joining with a private edit link per player
- Draft picks with a one-time Submit bracket button that locks the whole bracket
- Per-match kickoff locks still prevent late drafts for matches that have already started
- Round scoring: 1, 2, 4, 8, 16
- Leaderboard
- Admin result entry
- Optional automatic result sync through a Vercel function
- USA / Mexico / Canada visual theme

## Launch steps

1. Create a free Supabase project.
2. Open Supabase SQL Editor and run `supabase-schema.sql`.
3. Change `CHANGE_THIS_ADMIN_CODE` in the `pools` table to your own admin code.
4. Review the seeded Round of 32 teams and kickoff times before sharing. The included seed uses a published fixture list with all times labeled Eastern.
5. In `app.js`, replace:
   - `PASTE_SUPABASE_URL_HERE`
   - `PASTE_SUPABASE_ANON_KEY_HERE`
6. Push this folder to GitHub.
7. Import the GitHub repo in Vercel and deploy it for free.
8. Share the Vercel link with friends.

## Inviting friends

Send the normal site URL without a `player=` parameter. For example:

`https://your-vercel-project.vercel.app/`

Friends enter their name, make picks, and can use their private edit link only until they submit. After they click Submit bracket, their picks are locked.

## Automatic winner updates

Automatic updates require a sports-data API key. The app includes `api/auto-sync-results.js`, written for the API-Football fixture endpoint format.

In Vercel, add these environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FOOTBALL_API_KEY`
- `FOOTBALL_API_HOST` optional, defaults to `v3.football.api-sports.io`

Then fill `matches.external_id` with the provider's fixture IDs. The Results page has a Sync Winners button that calls the function.

Keep manual results available as a fallback. Free sports APIs can change coverage, quotas, or World Cup availability.

## Friendly mode fairness

Players can edit only matches whose `starts_at` time is still in the future. This means picks lock at kickoff even if you do not enter the final result until later.

## Admin access

The Results tab is visible, but saving winners requires the admin code. The browser only receives the pool id/name; the database does not expose `admin_token` to visitors. Winner updates go through `set_match_winner`, which checks the admin code on the server before changing a result.
