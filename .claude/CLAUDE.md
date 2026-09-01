# 혜택줍줍 (blog.importants-studio.com)

Korean blog on government benefits, welfare, and tax refunds. Hugo + PaperMod, deployed via GitHub Pages (merge to `main` = publish).

## Invariant rules (apply to every session in this repo)

- **NEVER push directly to `main`.** Always branch + PR. Merging is a human decision.
- **NEVER leave Claude traces in commits** — no Co-Authored-By, no AI mentions in commit messages or author fields.
- Posts live in `content/posts/YYYY-MM-DD-{english-slug}.md`. Required frontmatter: title, date (today at T09:00:00+09:00 — a future time gets excluded from the Hugo build), draft: false, slug, description, tags, categories (지원금/세금/복지/경제상식/경제브리핑), sourceUrl.
- Writing style rules are in `docs/writing-guide.md` — read it before writing or editing any post. AI-sounding prose is a failure.
- YMYL policy: benefit/tax facts (amounts, dates, eligibility) need 2+ sources, government sites first. Unverified numbers must not appear in a post — link to the official notice instead.
- Cover images: `static/images/covers/{slug}.jpg`, referenced via frontmatter `cover:` block. Missing cover must never block publishing.
- Never modify `themes/PaperMod` (submodule) or auto-generated files.
- Verify `hugo --gc --minify` passes before committing content changes.

## Theme constraints (PaperMod) — verified traps, do not rediscover

- **Dark mode is `:root[data-theme=dark]`, never a `.dark` class.** This PaperMod version toggles `html[data-theme]`. Any `.dark { ... }` rule is dead code — including the legacy `.dark` block near the top of `assets/css/extended/custom.css`. Don't add to it.
- **The content wrapper is `.post-content`, but the theme styles `.md-content`.** So the theme's own element styling (tables, etc.) never applies to posts. Anything rendered from markdown must be styled explicitly under `.post-content`.
- **The reset sets `table { display: block }`.** Table styles must restore `display: table` or columns collapse into each other.
- Markdown HTML is stripped (`unsafe: false`). Interactive markup (forms, widgets) belongs in `layouts/`, not in `.md` files.
- goldmark `strikethrough` is disabled on purpose — it eats Korean tilde ranges (`3~4일` → `34일`). Don't re-enable it.
- **Verify CSS against the served stylesheet, not the source file.** Fetch the fingerprinted `/assets/css/stylesheet.*.css` from the local Hugo server and grep for the new rule. A silently failed edit looks identical to success when you only read the source.

## Context

- Daily agent prompts and pipeline scripts live in a separate private repo (`importants-blog-pipeline`, local `~/blog-automation/`).
- Analytics: GA4 (report via `~/blog-automation/scripts/ga_report.py`), Google Search Console + Naver Search Advisor registered.
