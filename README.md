# 2026 Synthesized Fantasy Draft Board — 12-team snake

A phone-friendly draft board that blends rankings, projections and ADP from three
independent sources into one consensus, lets you set your draft slot, and toggles between
PPR and non-PPR scoring. It is a single static page, so GitHub Pages serves it as-is —
no build step, no server, no account.

## Put it on GitHub Pages

1. Create a new repository on github.com (public, no README).
2. Upload `index.html`, `app.js`, `news.js`, `data.js` and this `README.md` to the root of
   that repo — the web uploader at **Add file → Upload files** is enough, no git required.
   They must all sit in the same folder; `index.html` loads the others by relative path.
3. In the repo go to **Settings → Pages**, set **Source** to *Deploy from a branch*,
   pick branch `main` and folder `/ (root)`, then **Save**.
4. Wait about a minute. Your board is at
   `https://<your-username>.github.io/<repo-name>/`.
5. Open that on your phone and use **Share → Add to Home Screen**. It then behaves like
   an app, and your draft progress is saved on the device between openings.

## Using it during the draft

Set **Pick** to your slot and **Rounds** to your league's roster size once; both stick.
The **PPR / Non-PPR** switch reshuffles the whole board, projections and value numbers
instantly — non-PPR pushes the volume backs up and drops the possession receivers.

The header always shows who is on the clock and how many picks until your turn. Every
player has two buttons: **Me** when you draft him, **Taken** when anyone else does. Either
one advances the clock, so the board stays in sync with the room without you typing
anything. If you hit **Me** while it is not yet your turn, the app fills in the
intervening picks with the best available players so the player still lands on your
roster. Tap a player's *name* (rather than a button) to see how each platform ranks him,
where the sources disagree, and the odds he survives to your next turn. **Undo** reverses
the last pick.

Not a fantasy regular? The **?** button in the top right opens a plain-English glossary of
every abbreviation on the page — PROJ, VOR, ADP, tiers, snake order and the rest. The same
glossary is one tap away from the board legend and from inside each player's breakdown.

## Recent news

Every player's breakdown ends with a **Recent news** panel: the last 60 days of ESPN and
Rotowire items for that player, newest first, with the full Rotowire blurb rather than
just a headline. Anything mentioning a body part, a practice absence or injured reserve
gets a red **injury** chip; availability and role news — a suspension, a holdout, a
contract, sitting out a preseason game — gets an amber **status** chip. Those are the
items worth reading before you spend a pick.

Unlike the rankings, this part is live: it is fetched when you open a player, so it
reflects news from minutes ago rather than whenever `data.js` was last built. It costs two
requests per player the first time (one to find the player, one for his news) and is then
cached — ESPN player IDs forever, headlines for fifteen minutes — so reopening the same
player during a draft is free.

If ESPN is unreachable the panel says so and offers Google News and ESPN search links; the
rest of the board is unaffected and keeps working offline. Team defenses have no
player-level news, so they link to that team's injury report instead.

**My Pick** is the tab to open when it's your turn: it ranks the best available players by
value over replacement, weighted by the holes left in your lineup and by who is about to
disappear. **My Team** shows your lineup slotted out with projected points. **Sources**
documents where every number came from.

## What's in the synthesis

| Source | What it contributes |
| --- | --- |
| Fulltime Fantasy (FFToolbox) | Expert top-200 board, season point projections, auction values |
| CBS Sports | Average draft position across CBS-hosted leagues |
| Fantasy Football Calculator | Market ADP from 7,112 12-team mock drafts, Aug 14–21 2026 |

Each source is read separately for PPR and non-PPR. Ranks are averaged, with a penalty
rank charged when a source omits a player entirely, then re-sorted into the consensus
number in the left column. Where the sources disagree by 25 spots or more the player is
flagged as *split opinion* — those are the picks worth thinking about rather than
auto-drafting.

Projections come from the Fulltime Fantasy season totals in the matching scoring format.
Players outside that board are estimated from their own position's rank-to-points curve
and labelled as estimated. VOR is projected points minus the last startable player at
that position in a 12-team league (QB14, RB34, WR40, TE13), which is what makes an RB2
and a WR3 directly comparable. Kickers and defenses are ranked but carry no projection on
purpose — the spread between DST5 and DST15 is noise.

"Chance he lasts" treats each player's ADP as a normal distribution around its observed
standard deviation and asks how often he'd still be there at your next pick.

## Refreshing the data

`data.js` is a snapshot from 22 August 2026 and does not update itself. `build_data.py`
is the script that produced it: it parses saved copies of the three source pages and
writes `data.js`. To refresh, re-download those pages, point the `F_*` paths at them and
run `python3 build_data.py`. Everything else in the app reads from that one file.

The repo has four files and no build step:

- `index.html` — page shell and all styling
- `app.js` — draft logic, board rendering and the glossary text
- `news.js` — the live news panel; self-contained, nothing else depends on it
- `data.js` — the merged player dataset (`window.FF_DATA`)
- `build_data.py` — regenerates `data.js` from the source pages

Deleting `news.js` and its `<script>` tag removes the news feature cleanly and leaves the
rest of the board working — useful if ESPN ever changes those endpoints.

## Caveats

The board assumes a standard 1QB / 2RB / 2WR / 1TE / 1FLEX / K / DST lineup in a 12-team
snake league. Injuries and depth-chart news after 22 August 2026 are not reflected.
Consensus rankings are a starting point, not a verdict — the *split opinion* and tier
flags exist precisely because the aggregate hides real disagreement.
