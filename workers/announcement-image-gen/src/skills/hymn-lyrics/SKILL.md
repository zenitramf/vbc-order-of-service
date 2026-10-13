---
name: hymn-lyrics
description: Use whenever adding, editing, replacing, transcribing, or reformatting hymn lyrics with save_hymn or update_hymn — English or Spanish. Enforces the one lyrics layout — Verse 1 / Chorus / Verse 2 with the chorus written out once only.
---

# Hymn lyrics format

Every hymn's lyrics use exactly this layout, in English and in Spanish:

```text
Verse 1
<lyric lines, one per line>

Chorus
<lyric lines>

Verse 2
<lyric lines>
```

## Rules — always, no exceptions

1. Section labels are exactly `Verse 1`, `Verse 2`, … and `Chorus`, each
   alone on its own line. No markdown (`##`, `**`), no brackets, no colon.
2. Labels are **English even for Spanish hymns**. Never write `Estrofa`,
   `Verso`, or `Coro` as stored labels.
3. Lyric lines start on the line right below the label, one lyric line per
   line. Exactly one blank line between sections; no blank line at the
   start or end.
4. **The chorus is written out once only**, where it first belongs. Hymnals
   repeat the chorus after every verse — drop those repeats. Never add a
   `(Chorus)` repeat marker.
5. Verses are numbered sequentially from 1 in the order they appear.
6. Preserve the lyric words exactly as given — accents, punctuation, and
   `¡…!` included. Reformatting changes layout and labels only; never
   reword, translate (unless asked), or invent lines.
7. Only `Verse N` and `Chorus` sections exist. If a source has a Bridge,
   Pre-Chorus, Intro, or Ending, stop and ask the user what to do with it
   instead of guessing a label. If the chorus comes back with *different*
   words, ask which version to keep — never silently drop differing words.

The portal enforces this layout on save and will reject lyrics it cannot
reformat, so send them already canonical — that way what the user approves
is exactly what gets stored.

## Workflow

1. For an existing hymn, call `get_hymn` first and work from its current
   lyrics. When changing lyrics, always send the **whole** reformatted
   lyrics text, never just the added fragment.
2. Reformat the source into the layout above: label each stanza, number
   the verses, keep the chorus once.
3. Prefer `update_hymn` for lyrics-only changes; use `save_hymn` when
   creating a hymn or changing its metadata too.
4. In your pre-approval summary, say the lyrics were put into the standard
   Verse/Chorus layout and how many verses there are.

## Edge cases

- **No chorus:** verses only. Never invent a chorus.
- **Chorus only:** a single `Chorus` section, no verses.
- **Unlabeled stanzas:** each stanza becomes the next `Verse N`, unless its
  words repeat between verses — that stanza is the chorus: label it
  `Chorus`, keep its first occurrence in place, drop the repeats.
- **No lyrics yet:** an empty lyrics value is fine; hymns without lyrics
  are flagged in the portal until lyrics are added.

## Examples

Spanish — note the English labels:

```text
Verse 1
Cristo tanto me amó,
Que en la cruz por mí murió;
Por su sangre me limpió
De mi pecado y transgresión.

Chorus
Al Cordero gloria,
Oh, qué excelsa historia:
Él nos salva por su amor,
¡Dad al Cordero gloria!

Verse 2
Dios al mundo descendió;
Pues mi castigo en sí tomó;
Pena y muerte él sufrió,
Mas con poder resucitó.
```

Bad → good: `[Chorus]` → `Chorus`; `## Verse 2` → `Verse 2`;
chorus pasted again after Verse 2 → deleted; a wall of text with stanzas
run together → split into labeled sections following the stanza breaks.
