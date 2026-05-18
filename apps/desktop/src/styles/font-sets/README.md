# styles/font-sets

Three runtime-swappable font sets. Apply by adding a `font-set-<id>` class to `<html>`.

## Sets

| Class | Label | Purpose |
|---|---|---|
| `font-set-system-sans` | System Sans | OS default stack — zero webfont dependency, safe fallback |
| `font-set-ru-display` | Ru Display | **Default cold-start set.** Brand stack: Inter Tight UI + Source Serif 4 display |
| `font-set-ru-editorial` | Ru Editorial | Long-form note writing: Source Serif 4 carries patient-note body text |

## When to use each

- **system-sans** — offline environments, accessibility testing, fallback when webfonts fail.
- **ru-display** — default; balanced UI chrome + elevated headings via Source Serif 4.
- **ru-editorial** — switch for clinicians doing heavy note-writing; prose surface uses Source Serif 4 body.

## How they work

Each set overrides `--font-sans`, `--font-mono`, and `--font-display` CSS variables declared in `tokens.css`. Workbench chrome elements reference `--font-sans`; headings and display copy reference `--font-display`. Only `ru-editorial` also pipes `--font-display` into the `.ru-edit-host` body text.

Webfonts are loaded by `../fonts/google-fonts.css` — that import must precede any font-set class application.
