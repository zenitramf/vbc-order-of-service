import { describe, expect, it } from "vitest";

import { normalizeHymnLyrics } from "~/lib/hymn-lyrics-format";

const CANONICAL_SPANISH = `Verse 1
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
Mas con poder resucitó.`;

describe("normalizeHymnLyrics", () => {
  it("keeps canonical Spanish lyrics byte-identical", () => {
    expect(normalizeHymnLyrics(CANONICAL_SPANISH)).toEqual({
      changed: false,
      lyrics: CANONICAL_SPANISH,
      ok: true,
    });
  });

  it("keeps empty lyrics empty", () => {
    expect(normalizeHymnLyrics("  \n\n ")).toEqual({
      changed: true,
      lyrics: "",
      ok: true,
    });
    expect(normalizeHymnLyrics("")).toEqual({
      changed: false,
      lyrics: "",
      ok: true,
    });
  });

  it("drops a repeated chorus after later verses", () => {
    const repeated = `${CANONICAL_SPANISH}

Chorus
Al Cordero gloria,
Oh, qué excelsa historia:
Él nos salva por su amor,
¡Dad al Cordero gloria!`;

    expect(normalizeHymnLyrics(repeated)).toEqual({
      changed: true,
      lyrics: CANONICAL_SPANISH,
      ok: true,
    });
  });

  it("drops an unlabeled stanza that repeats the chorus words", () => {
    const repeated = `${CANONICAL_SPANISH}

Al Cordero gloria,
Oh, qué excelsa historia:
Él nos salva por su amor,
¡Dad al Cordero gloria!`;

    expect(normalizeHymnLyrics(repeated)).toEqual({
      changed: true,
      lyrics: CANONICAL_SPANISH,
      ok: true,
    });
  });

  it("normalizes decorated labels, blank lines, and CRLF", () => {
    const messy =
      "[Verse 1]\r\nAmazing grace! how sweet the sound  \r\n\r\n\r\n**Chorus:**\r\nPraise God, praise God\r\n\r\n## Verse 2\r\n'Twas grace that taught my heart to fear\r\n";

    expect(normalizeHymnLyrics(messy)).toEqual({
      changed: true,
      lyrics: `Verse 1
Amazing grace! how sweet the sound

Chorus
Praise God, praise God

Verse 2
'Twas grace that taught my heart to fear`,
      ok: true,
    });
  });

  it("labels unlabeled stanzas as sequential verses without inventing a chorus", () => {
    expect(
      normalizeHymnLyrics("First stanza line\n\nSecond stanza line")
    ).toEqual({
      changed: true,
      lyrics: `Verse 1
First stanza line

Verse 2
Second stanza line`,
      ok: true,
    });
  });

  it("turns Spanish section labels into English labels, lyric text untouched", () => {
    expect(
      normalizeHymnLyrics(
        "Estrofa 1\nCristo tanto me amó,\n\nCoro\nAl Cordero gloria,"
      )
    ).toEqual({
      changed: true,
      lyrics: `Verse 1
Cristo tanto me amó,

Chorus
Al Cordero gloria,`,
      ok: true,
    });
  });

  it("renumbers verses in order of appearance", () => {
    expect(
      normalizeHymnLyrics("Verse 3\nThird first\n\nVerse 1\nFirst second")
    ).toEqual({
      changed: true,
      lyrics: `Verse 1
Third first

Verse 2
First second`,
      ok: true,
    });
  });

  it("keeps a chorus-only hymn as Chorus", () => {
    const chorusOnly = "Chorus\nI will sing of the mercies of the Lord";

    expect(normalizeHymnLyrics(chorusOnly)).toEqual({
      changed: false,
      lyrics: chorusOnly,
      ok: true,
    });
  });

  it("rejects a chorus repeated with different words", () => {
    const result = normalizeHymnLyrics(
      "Verse 1\nA line\n\nChorus\nFirst chorus\n\nVerse 2\nB line\n\nChorus\nDifferent chorus"
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/chorus/iu);
    }
  });

  it("rejects unsupported section labels instead of guessing", () => {
    const result = normalizeHymnLyrics("Verse 1\nA line\n\nBridge\nB line");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/bridge/iu);
    }
  });

  it("joins blank-line halves inside a labeled verse and chorus", () => {
    expect(
      normalizeHymnLyrics(
        "Verse 1\nMarvelous grace of our loving Lord,\nGrace that exceeds our sin and our guilt!\n\nYonder on Calvary's mount out-poured–\nThere where the blood of the Lamb was spilt\n\nChorus\nGrace, grace, God's grace,\nGrace that will pardon and cleanse within;\n\nGrace, grace, God's grace,\nGrace that is greater than all our sin!"
      )
    ).toEqual({
      changed: true,
      lyrics: `Verse 1
Marvelous grace of our loving Lord,
Grace that exceeds our sin and our guilt!
Yonder on Calvary's mount out-poured–
There where the blood of the Lamb was spilt

Chorus
Grace, grace, God's grace,
Grace that will pardon and cleanse within;
Grace, grace, God's grace,
Grace that is greater than all our sin!`,
      ok: true,
    });
  });

  it("tolerates a blank line between a label and its lyrics", () => {
    expect(
      normalizeHymnLyrics("Verse 1\n\nA line\n\nChorus\n\nSing it")
    ).toEqual({
      changed: true,
      lyrics: "Verse 1\nA line\n\nChorus\nSing it",
      ok: true,
    });
  });

  it("rejects an empty section", () => {
    const result = normalizeHymnLyrics(
      "Verse 1\nA line\n\nVerse 2\n\nVerse 3\nC line"
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/verse 2/iu);
    }
  });

  it("is idempotent", () => {
    const once = normalizeHymnLyrics(
      "verse 1:\nA line\n\n\nchorus\nSing it\n\nverse 2\nB line\n\nchorus\nSing it"
    );

    expect(once.ok).toBe(true);
    if (once.ok) {
      expect(normalizeHymnLyrics(once.lyrics)).toEqual({
        changed: false,
        lyrics: once.lyrics,
        ok: true,
      });
    }
  });
});
