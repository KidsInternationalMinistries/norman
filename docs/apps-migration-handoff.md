# Handoff: move Talk Prep into the apps app

For the Claude working in Norman's VS Code on `KidsInternationalMinistries/apps`.
Written Nov 8 2026 by the Claude that built Talk Prep (the GitHub Pages site in `KidsInternationalMinistries/norman`).
Nothing has been changed in the apps repo yet. Read this whole file before planning.

Follow the apps `CLAUDE.md` for everything about how to build (branches, migrations, RLS, rights, nav, phone + desktop, error handling, release). This file only covers **what** to build and what Talk Prep does today.

---

## 1. Decisions Norman has made

- Build a **new module `app/modules/tools/talk-prep`**.
- **Delete the Talk Notes module** (`app/modules/tools/talk-notes`) and its talks. Nobody uses it. Copy its useful patterns first (talk stored as one JSONB, Realtime broadcast from `api/[talkId]/sync`, PowerPoint export) then remove the folder, its `modules.json` and menu entries, and drop `module_tools_talk_notes_talks` / `module_tools_talk_notes_shares` plus its `fw_modules` / `fw_rights` rows in a migration. Check a row count on prod first and say what you find.
- **Access is by module rights only.** No per-talk sharing table. Suggested rights: `talk-prep.view` (open and present), `talk-prep.editor` (edit, use AI), `talk-prep.admin` (delete, settings).
- **The one finished talk must carry over completely:** "Character, Calling & Conviction" (folder `talks/Character-Calling-Conviction`). See section 5.
- Norman's direction from before (still true): get the UI and the AI features working; one shared key per service is fine; use ESV for verses; AI changes are reviewed in an accept/reject dialog with "Accept all"; a section rewrite creates a "(draft)" copy instead of overwriting.
- Still open, ask Norman: move only the v2 version (talk2.json pages) and keep v1 `talk.json` as an archive only? (Recommended: yes.)

## 2. Where each part goes

| Part | Today (norman repo) | In apps |
| --- | --- | --- |
| Talk content | `talks/<Folder>/talk2.json` (format `talk/2`), saved through the GitHub contents API | `module_tools_talk_prep_talks`: id, slug (old folder name), title, `content` JSONB = talk2.json as-is, `updated_at`, `updated_by` |
| Old v1 content | `talk.json` | Store once in the versions table (or a `content_v1` column) as an archive |
| Backups | `backups/` folder | `module_tools_talk_prep_versions`: snapshot on every save; restore from it |
| Pictures, voice MP3s, PDFs | Files in the talk folder (CCC: 87 MB, mostly 126 voice MP3s) | Private Storage bucket `talk-prep`, path `<org>/<talkId>/<same relative path>`; served by signed URLs |
| OpenAI, ElevenLabs, ESV keys | AES-encrypted in `talks/common/keys.json`, unlocked in the browser with the presenter password | Server env `OPENAI_API_KEY` (exists), add `ELEVENLABS_API_KEY`, `ESV_API_KEY` to `.env.production`, `.env.public`, `.env.example`. Browser never sees a key; presenter password goes away |
| AI features | `talks/common/ai.js`, browser calls the APIs directly | Server routes under `talk-prep/api/ai/*`, right-checked, with a spend limit like Toolbox AI Images (`app/modules/tools/toolbox/lib/aiImages/server.js` is the model) |
| Live "Next" | Cloudflare Worker relay (`relay/src/index.js`) | Supabase Realtime broadcast, channel `talk-prep:<talkId>` |
| Polls | Relay `/vote` (votes per voter, epoch reset) | Table `module_tools_talk_prep_votes` (talk, poll key, epoch, voter, answer), totals broadcast on the channel |
| Phone/screen count | Relay `/count` | Realtime presence on the channel |
| Translation reviews | Relay `/review` | Table `module_tools_talk_prep_reviews` |
| Editor and Stage | `edit2.html`, `present2.html` (code in `talks/common/app2.js`, 234 KB, plus `app.js` helpers and `ai.js` 101 KB) | Signed-in pages under `/modules/tools/talk-prep/[talkId]/...` |
| Slides window, monitor | `slides2.html`, `index.html` | Full-screen signed-in pages, no app header |
| Audience phone page, translation review, walking practice | `audience.html`, `review.html`, `practice.html` | **Public, no login** (like Voice Translate's `external/[sessionId]` viewer). Read through a narrow server route that returns only slides + audience notes, never the full text or talking points |
| Narrated version | `slides2.html?play` + `narration2.json` + `voice/*.mp3` | Public play page reading the same data from the bucket |
| Prepare page (chat brief, then "Create talk") | `talks/prepare.html` | Signed-in page in the module |

Keep relative paths inside `content` (e.g. `slides/bg/p1d.jpg`, `voice/<hash>.mp3`) and resolve them against the bucket at runtime. Then the JSON stays identical to the GitHub copy and is easy to compare.

## 3. The talk/2 format (what `content` holds)

Top-level keys in CCC's talk2.json: `format` ("talk/2"), `id`, `title`, `audience`, `length`, `event`, `bigIdea`, `timerMinutes`, `relayTopic`, `lastPractice`, `voice` (ElevenLabs voice id), `voiceName`, `voiceModel` ("v4"), `v3Feel`, `wpm`, `imageStyle`, `text`, `slides[]`, `times{}`, `notes{}`, `audNotes{}`, `languages[]`, `pdf{}`, `pdfHash`, `reviewsDone[]`.

**`text`** is one string for the whole talk with tags:
- `[#1 Section|id]`, `[#2 Point|id]`, `[#3 Sub point|id]` outline tags (numbering 1, 1.a, 1; `|id` is a short id that notes hang on). Norman calls level 1 "Section".
- `[Slide name]` shows that slide from `slides[]`; `[Start]`, `[Stop]` (pause step that keeps the slide).
- Reading cues for the voice: `[Pause]`, `[Long pause]`, `[Excited]words[/Excited]` (ranged), `[Slow]`, etc. Cues never create a Next step. A cue without a range covers the next sentence only.
- Stage directions in plain brackets, e.g. `[ Walk off the stage - 20 seconds then come back up]`.

**Stepping rule (Norman's):** Next highlights the next stretch of words between break tags (outline tag, slide tag, Stop; cues don't break). Points with no words are skipped. A slide comes up with the words after it; a slide with no words after it gets its own Next. A slide belongs to the point it's under; the next point at that level or higher brings back the parent's slide (or keeps the last); a slide's `keep` flag keeps it up until another slide. The highlight is a light box behind the stretch, not a text highlight.

**`slides[]`** (CCC has 53: 29 verse, 21 image, 2 video, 1 poll). Fields seen: `name`, `type` (image, plain, bullets, bulletsimg, quote, verse, video, poll), `eyebrow`, `slideTitle`, `slide` (subtitle), `bullets`, `image`, `prevImage`, `imagePrompt`, `layout`, `align`, `text`, `ref`, `version`, `aiText` (verse text from AI, show "check it against your Bible" until edited), `video`/`url`, `secs`, `autoNext`, `qr` {x,y,w in %}, poll fields `reveal` (live|next), `phoneQ`, `phoneA`, per-line placement `ebX/ttX/sbX…`, `…Y`, `…W`, `…Size`, `…Align`, and translations `tr{lang}` + `trSrc{lang}`. Slide text is added as live text over the picture; **AI pictures must never contain text**.

**`notes{}`** = talking points, HTML, keyed by outline id; `notes[id]` is Next press 1, `notes[id+":2"]` press 2, and so on. Norman's style: 1–4 word catch phrases, Title Case, no sentences, about one line per paragraph of text.

**`audNotes{}`** = audience notes per outline id (and per press, same `:N` keys): `{html, tr{lang}, src{lang} (original it was translated from), ed{lang} (hand-edited)}`. `languages[]` = talk's translation languages (CCC: Tagalog). Re-translation sends the old original, the existing translation and the new original so hand edits survive.

**`times{}`** = practice times per point (keyed id or "2|text"). `wpm` = his normal pace (120 set); `timerMinutes` = talk length; outline shows minutes per point.

**`pdf{}`** = last audience PDF `{file, at, sha}`. The audience PDF is now made on the phone on tap (slide, notes in reader's language, whole talk in English).

`narration2.json` = `{format, voice, model, made, steps[]}`; voice pieces are named `voice/<sha16(voice|model|settings|words)>.mp3` and reused by Listen. Keep the names so nothing is re-read (ElevenLabs costs money).

## 4. Features to port (all exist today; check `app2.js`/`ai.js` for detail)

Edit page
- Three panes with draggable dividers: outline tree | full text | right column (slide on top; tabs Talking points / Slides / In order of use / Audience notes). Edit and Stage look almost the same.
- "/" menu in the text: Section, Point, Sub point, Slide… (thumbnail picker), Stop, Pause, Long pause.
- Selecting text shows ✨: grammar, spelling, tighten, listen from here, voice for those words.
- ✨ Outline from the text; ✨ Draft talking points (per part or all); ✨ Check spelling (text + slides); grammar/flow walk-through with Accept / Reject / Accept all; tighten to N minutes; suggest a slide; section draft as "(draft)" copy.
- Slide editor: drag and resize each text line, Left/Center/Right, A−/A+, Reset; QR checkbox with drag; Create/change picture (2 options, uses talk picture style + style image); verse look-up (reference + version via ESV; words instead of a reference → 5 likely verses to pick); suggest words.
- Audience notes with ✨ Translate / Draft per language, "Translate everything new", review-link button, "N translation reviews" walk-through with Accept/Reject.
- Listen (ElevenLabs, word highlight, prefetch next step, saved pieces), voice choice (Standard v2, Expressive v3/v4, stability), Narrated version.
- Backup: offline single HTML (Stage/Slides with no internet) and PowerPoint (PptxGenJS); "PDF with the talk".
- Talk details: title, audience, length, wpm, voice, picture style, languages.

Stage
- Left outline, middle text, right slide + big talking points for the current press. Next/Back, clicker keys, practice timing checkbox, countdown, "📱 N phones · 🖥 N screens", Clear votes, poll reveal on Next, video autoplay muted with auto-Next.
- Opens a Slides window on a second screen (BroadcastChannel, works offline) and drives monitors elsewhere over the live channel.

Audience phone page (public)
- Follows live: slide (translated words), line, notes in phone language (picker), browse back, "Back to live", capped at the speaker's point while live; vote on polls once; download PDF on the last section.
- Must handle 200–300 phones. Today phones use one stream + 40 s heartbeat watchdog and no polling (Cloudflare free limits). With Supabase Realtime, check the plan's concurrent-connection limit before a big event.

Lessons from live use
- Venue Wi-Fi once blocked api.github.com; pages fell back to a cached copy. In apps, Stage and Slides should keep the loaded talk and all images in memory so a drop doesn't stop the talk.
- Phones at a table all stopped following once after a poll; reconnect on wake/online/no heartbeat for 40 s.

## 5. Carry over the CCC talk

Source: `KidsInternationalMinistries/norman`, branch `main`, folder `talks/Character-Calling-Conviction/` (pull fresh; Norman edits in the browser).

| What | Size | Where it goes |
| --- | --- | --- |
| `talk2.json` | 106 KB, 19,588-char text, 53 slides, 29 talking-point sets, 27 audience notes with Tagalog | `content` of a new talks row, slug `Character-Calling-Conviction` |
| `talk.json` (v1) | 54 KB | archive version row |
| `slides/bg/*.jpg` (20) + `slides/*.jpg` (3) | 3.5 MB | bucket, same relative paths |
| `voice/*.mp3` (126) + `narration2.json` | 82 MB | bucket, same names; narration in `content` or its own column |
| `pdf/audience.pdf` | 1.9 MB | bucket (optional, phones make it now) |
| `backups/*.json` | 64 KB | versions table |
| Video slide | already a URL in apps' prod `fw_videos` public bucket | keep the URL |
| `reviewsDone`, poll votes, pending reviews in the relay | small | `reviewsDone` is in content; pending relay reviews can be read from `GET https://norman.normandenler.workers.dev/<relayTopic>/review` and inserted |

Write an import script (in `_temp/` or `scripts/`) that reads the folder, inserts the row, uploads the files, and is safe to re-run. Run it on local first, then QA, then prod. Then check: slide count, note count, every image and voice file opens, and Stage steps through the same Next presses as the GitHub site (compare side by side).

## 6. Suggested order

1. Module skeleton, rights, nav entry, module `CLAUDE.md`.
2. Migration: talks, versions, votes, reviews tables; RLS; bucket. `npm run check:rls`.
3. Server API: list/get/save (version row on save; refuse a stale save), media upload/sign, public audience route, AI routes.
4. Import script + CCC import on local.
5. Edit + Prepare pages.
6. Stage, Slides window, monitor, Realtime sync, presence counts, polls. Test with a laptop, a monitor and two phones on QA.
7. Audience, review, practice and narrated pages (public).
8. Remove Talk Notes (folder, nav, migration dropping its tables).
9. build-qa, Norman tests, release with his OK, migrations at `/admin/migrations`, keys on the VM for both services, grant rights.
10. Run one real talk on apps, then put a "moved" banner on the GitHub Pages site. Retire the Cloudflare relay when nothing uses it.

## 7. Working with Norman

- He reads replies on his phone between other work: lead with the result, plain words, short.
- Show work in small batches he can try; he gives quick feedback and changes his mind after trying things, so keep choices easy to reverse.
- AI-made content is always reviewable (accept/reject, "(draft)" copies), never silently replaces his words. Where his own wording exists, keep it verbatim.
- Don't put any API key in a repo file or chat.

## 8. Where to look in the norman repo

- `talks/common/app2.js` – v2 Edit/Stage/audience/practice/review logic (`build()`, stepping, slide scope, sync).
- `talks/common/app.js` – shared helpers (slide types `SLIDE_TYPES`, rendering, video handling `vidWhere`, PDF, backups).
- `talks/common/ai.js` – every AI call and its prompts (OpenAI text models gpt-5.1 → gpt-5 → gpt-4.1; images gpt-image-2; ElevenLabs; ESV).
- `talks/common/app2.css`, `app.css` – look and layout.
- `relay/src/index.js` – the live relay protocol being replaced.
- `talks/common/export_talk2.py` – turns talk2.json into readable Markdown (useful for checking an import).
