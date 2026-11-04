# Norman's public pages

Published from Norman's project. Served by GitHub Pages at https://kidsinternationalministries.github.io/norman/

## talks/

One folder per talk (for example `talks/Character-Calling-Conviction/`):

- `talk.json`: the whole talk (movements, points, cues, slide text, key points, verses, full text). **This file is the master copy.**
- `slides/`: slide images.
- `edit.html`: editor. It saves every change straight into `talk.json` with a GitHub token stored in that browser.
- `present.html`: Stage/presenter view (password), with the countdown timer and sync to the monitors.
- `index.html`: monitor, slides only. It follows the presenter through a public relay (ntfy.sh).

Shared code lives in `talks/common/`, and `talks/talks.json` lists the talks for `talks/index.html` (which has a New talk button).

Everything in this repository is public.
