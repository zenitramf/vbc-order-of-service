/**
 * The one canonical layout for hymn lyrics, English and Spanish alike:
 *
 * ```text
 * Verse 1
 * <lyric lines, one per line>
 *
 * Chorus
 * <lyric lines>
 *
 * Verse 2
 * <lyric lines>
 * ```
 *
 * Section labels are always the English `Verse N` / `Chorus` on their own
 * line, sections are separated by exactly one blank line, verses are
 * numbered sequentially, and the chorus appears exactly once — a chorus
 * repeated after later verses is dropped. Lyric text itself is never
 * reworded; only layout and labels are normalized.
 *
 * Blank lines *inside* a labeled section (a verse written as two halves)
 * are layout, not structure: they are removed and the lines joined under
 * the section's label. Blank lines only separate sections when the lyrics
 * have no labels to follow.
 *
 * `normalizeHymnLyrics` fixes everything mechanical and reports the rest
 * (unsupported section labels, empty sections, a chorus repeated with
 * different words) as errors instead of guessing. It is idempotent:
 * canonical input returns `changed: false` and the identical string.
 */

export type NormalizeHymnLyricsResult =
  | { changed: boolean; lyrics: string; ok: true }
  | { errors: string[]; ok: false };

/** Short format reminder shared by the hymn editors and the MCP tools. */
export const HYMN_LYRICS_FORMAT_HINT =
  "Format lyrics as “Verse 1”, then the lyric lines, a blank line, “Chorus”, then its lines, a blank line, “Verse 2”, and so on. Labels are English for Spanish hymns too, and the chorus is written out once only.";

type SectionKind = "chorus" | "verse";

interface LyricsSection {
  kind: SectionKind;
  /** Whether this section came from an explicit label line. */
  labeled: boolean;
  /** Label as written in the input, for error messages. */
  label: string;
  /** Blank-line-separated blocks under this section, in order. */
  stanzas: string[][];
}

const VERSE_LABEL =
  /^(?:verse|verso|estrofa|stanza)\s*\.?\s*\d*$|^v\.?\s*\d+$|^\d+\.$/iu;
const CHORUS_LABEL = /^(?:chorus|coro|refrain|refrán|estribillo)\s*\d*$/iu;
const UNSUPPORTED_LABEL =
  /^(?:bridge|puente|pre[- ]?chorus|intro(?:duction)?|outro|ending|coda|interlude|tag|vamp|channel|final)\s*\d*$/iu;
const LEADING_DECORATION = /^[#>*_\s[]+/u;
const TRAILING_DECORATION = /[\s\]*_:]+$/u;

/** Strip markdown decoration so `## **Chorus:**` classifies as a label. */
const undecorated = (line: string): string =>
  line.replace(LEADING_DECORATION, "").replace(TRAILING_DECORATION, "");

type LabelKind = SectionKind | "unsupported" | null;

const classifyLabel = (line: string): LabelKind => {
  const candidate = undecorated(line);

  if (!candidate) {
    return null;
  }
  if (VERSE_LABEL.test(candidate)) {
    return "verse";
  }
  if (CHORUS_LABEL.test(candidate)) {
    return "chorus";
  }
  if (UNSUPPORTED_LABEL.test(candidate)) {
    return "unsupported";
  }

  return null;
};

const sectionLines = (section: LyricsSection): string[] =>
  section.stanzas.flat();

/** Comparison key for "same words" checks (chorus de-duplication). */
const linesKey = (lines: string[]): string =>
  lines
    .map((line) => line.trim().replaceAll(/\s+/gu, " ").toLowerCase())
    .join("\n");

const parseSections = (
  input: string
): { errors: string[]; sections: LyricsSection[] } => {
  const errors: string[] = [];
  const sections: LyricsSection[] = [];
  let current: LyricsSection | null = null;
  let stanza: string[] = [];

  const flushStanza = (): void => {
    if (stanza.length > 0 && current) {
      current.stanzas.push(stanza);
    }
    stanza = [];
  };

  const flushSection = (): void => {
    flushStanza();

    if (!current) {
      return;
    }
    if (sectionLines(current).length === 0) {
      errors.push(
        `The “${current.label}” section has no lyric lines. Add its lines or remove the label.`
      );
    } else {
      sections.push(current);
    }
    current = null;
  };

  const startSection = (kind: SectionKind, label: string): void => {
    flushSection();
    current = { kind, label, labeled: true, stanzas: [] };
  };

  for (const rawLine of input.replaceAll("\r\n", "\n").split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      // A blank line ends the current stanza. For unlabeled lyrics it also
      // ends the section (the next stanza is the next verse); inside a
      // labeled section it is just layout between the section's halves.
      if (current && !current.labeled) {
        flushSection();
      } else {
        flushStanza();
      }
      continue;
    }

    const label = classifyLabel(line);

    if (label === "unsupported") {
      errors.push(
        `“${line}” is not a supported section label. Use only “Verse 1”, “Verse 2”, … and “Chorus”.`
      );
      startSection("verse", line);
      continue;
    }

    if (label) {
      startSection(label, line);
      continue;
    }

    current ??= { kind: "verse", label: "Verse", labeled: false, stanzas: [] };
    stanza.push(line);
  }

  flushSection();

  return { errors, sections };
};

export const normalizeHymnLyrics = (
  input: string
): NormalizeHymnLyricsResult => {
  if (!input.trim()) {
    return { changed: input !== "", lyrics: "", ok: true };
  }

  const { errors, sections } = parseSections(input);
  const chorusKeys = new Set(
    sections
      .filter((section) => section.kind === "chorus")
      .map((section) => linesKey(sectionLines(section)))
  );

  if (chorusKeys.size > 1) {
    errors.push(
      "The chorus appears more than once with different words. Keep one “Chorus” section only — do not repeat it after each verse."
    );
  }

  if (errors.length > 0) {
    return { errors, ok: false };
  }

  const [chorusKey] = chorusKeys;
  let chorusSeen = false;
  const kept: LyricsSection[] = [];

  for (const section of sections) {
    if (section.kind === "chorus") {
      if (!chorusSeen) {
        chorusSeen = true;
        kept.push(section);
      }
      // Later labeled repeats of the chorus are dropped.
      continue;
    }

    if (chorusKey === undefined) {
      kept.push(section);
      continue;
    }

    // Drop any stanza that is just the chorus words again (labeled or
    // not) — the chorus is written out once only.
    const stanzas = section.stanzas.filter(
      (lines) => linesKey(lines) !== chorusKey
    );

    if (stanzas.length > 0) {
      kept.push({ ...section, stanzas });
    }
  }

  let verseNumber = 0;
  const lyrics = kept
    .map((section) => {
      const label =
        section.kind === "chorus" ? "Chorus" : `Verse ${(verseNumber += 1)}`;

      return [label, ...sectionLines(section)].join("\n");
    })
    .join("\n\n");

  return { changed: lyrics !== input, lyrics, ok: true };
};

/**
 * Canonical lyrics or a thrown `Error` naming every problem — the save-path
 * enforcement used for both the human editors and Rick's MCP tools.
 */
export const normalizeHymnLyricsOrThrow = (input: string): string => {
  const result = normalizeHymnLyrics(input);

  if (!result.ok) {
    throw new Error(`Lyrics format: ${result.errors.join(" ")}`);
  }

  return result.lyrics;
};
