# Release-day playbook: adding a new Skild release to the Hall

When Skild ships something new (a model, a paper, a partnership), the Hall gets a new pavilion: plaque, official video and a TRY stand. The goal is to have it ready on the day the post goes live.

## 1. Add the entry (≈10 min)
Append an object to `src/app/public/hall/releases.js` → `RELEASES` (keep chronological order):
```js
{
  id: 'new-thing', date: 'YYYY-MM-DD', kind: 'model' | 'company' | 'partnership', code: 'SKD-12',
  title: 'Short name', subtitle: 'One-line subtitle',
  url: 'https://www.skild.ai/blogs/<slug>',
  summary: '2 sentences in our own words.',
  points: ['fact from the post', 'fact', 'fact'],
  videos: [mp4(BASE, 'clip-name', 'Label'), yt('YouTubeId', 'Label')],
  try: {module: 'new-thing', title: 'Verb the thing', verb: '…', blurb: 'What the visitor does, in one line.'},
}
```
- mp4 clips: the blog's `<video>` sources live under `https://assets.skild.ai/site/v1/blog/<id>/<name>.mp4`, and posters under `<name>-poster.jpg`.
- YouTube: use the id only. The hall uses `youtube-nocookie` embeds and thumbnails.
- The pavilion, plaque, timeline entry, passport dot and deep link are all generated from this entry automatically.

## 2. Build the TRY stand (½–1 day)
- Brief: `src/app/public/hall/try/STAND_BRIEF.md`. Reference stand: `try/s1.js`.
- File: `src/app/public/hall/try/<module>.js`. Until it exists, the stand shows "under construction", so the pavilion can go live earlier.
- The rule of thumb: the visitor should *do* the release's one idea within 60 seconds, with a with/without contrast.

## 3. Presentation links
- Start at the pavilion: `/hall/?release=<id>`
- Start at the pavilion with the video already open: `/hall/?release=<id>&present`
- Automated checks: add `&debug` (exposes `__hall()`, `__hallGo()`, `__hallTeleport()`).

## 4. Check
- `node src/app/tools/smoke-local.mjs` (with the server running) and a manual pass: walk up, watch, try, complete.
- All copy in English. Facts only from the post. Official videos only.

## 5. Ship (director's command only)
Nothing is published automatically. Hosting and open-sourcing the repo happen only when the director says so.
