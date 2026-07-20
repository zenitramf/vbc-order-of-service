export interface MusicKeyOption {
  aliases: readonly string[];
  label: string;
  relativeLabel: string;
  value: string;
}

export const MUSIC_KEY_OPTIONS: readonly MusicKeyOption[] = [
  { aliases: [], label: "C", relativeLabel: "A", value: "C" },
  { aliases: [], label: "G", relativeLabel: "E", value: "#" },
  { aliases: [], label: "D", relativeLabel: "B", value: "##" },
  { aliases: [], label: "A", relativeLabel: "F♯", value: "###" },
  { aliases: [], label: "E", relativeLabel: "C♯", value: "####" },
  { aliases: [], label: "B", relativeLabel: "G♯", value: "#####" },
  {
    aliases: ["bbbbbb"],
    label: "F♯ / G♭",
    relativeLabel: "D♯",
    value: "######",
  },
  { aliases: [], label: "D♭", relativeLabel: "B♭", value: "bbbbb" },
  { aliases: [], label: "A♭", relativeLabel: "F", value: "bbbb" },
  { aliases: [], label: "E♭", relativeLabel: "C", value: "bbb" },
  { aliases: [], label: "B♭", relativeLabel: "G", value: "bb" },
  { aliases: [], label: "F", relativeLabel: "D", value: "b" },
] as const;

export const isSupportedMusicKey = (value: string): boolean => {
  const normalized = value.trim();

  return MUSIC_KEY_OPTIONS.some(
    (option) =>
      option.value === normalized || option.aliases.includes(normalized)
  );
};
