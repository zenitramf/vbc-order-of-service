import { FloppyDiskIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";

import { MusicKeySelector } from "~/components/music-key-selector";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "~/components/ui/native-select";
import { Textarea } from "~/components/ui/textarea";
import { saveHymn } from "~/lib/order-service-data";
import type { HymnRecord, ReferenceData } from "~/lib/order-service-types";

interface HymnEditorPageProps {
  hymn?: HymnRecord;
  referenceData: ReferenceData;
}

export const HymnEditorPage = ({
  hymn,
  referenceData,
}: HymnEditorPageProps) => {
  const navigate = useNavigate();
  const saveHymnFn = useServerFn(saveHymn);
  const [hymnNumber, setHymnNumber] = React.useState(hymn?.hymnNumber ?? "");
  const [name, setName] = React.useState(hymn?.name ?? "");
  const [lyricsMarkdown, setLyricsMarkdown] = React.useState(
    hymn?.lyricsMarkdown ?? ""
  );
  const [musicKey, setMusicKey] = React.useState(hymn?.musicKey ?? "");
  const [lastPlayed, setLastPlayed] = React.useState(
    (hymn?.lastPlayed ?? "").slice(0, 10)
  );
  const timesPlayedLastSixMonths = hymn?.timesPlayedLastSixMonths ?? 0;
  const [sourceId, setSourceId] = React.useState(
    hymn?.sourceId ?? referenceData.hymnSources[0]?.id ?? "living-hymns"
  );
  const [isSaving, setIsSaving] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);

    try {
      const result = await saveHymnFn({
        data: {
          hymnNumber,
          id: hymn?.id,
          lastPlayed,
          lyricsMarkdown,
          musicKey,
          name,
          sourceId,
        },
      });
      await navigate({ params: { hymnId: result.id }, to: "/hymns/$hymnId" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {hymn ? "Edit Hymn" : "New Hymn"}
          </h1>
          <p className="text-muted-foreground">
            Manage hymn metadata, lyrics, source tags, and play history used
            while planning services.
          </p>
        </div>
        <Button disabled={isSaving} type="submit">
          <FloppyDiskIcon data-icon="inline-start" />
          {isSaving ? "Saving…" : "Save hymn"}
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardHeader>
            <CardTitle>Hymn details</CardTitle>
            <CardDescription>
              Hymn selections in orders come from this library.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="hymn-number">Hymn number</FieldLabel>
                <Input
                  id="hymn-number"
                  onChange={(event) => setHymnNumber(event.target.value)}
                  value={hymnNumber}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="hymn-name">Name</FieldLabel>
                <Input
                  id="hymn-name"
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="source">Source tag</FieldLabel>
                <NativeSelect
                  className="w-full"
                  id="source"
                  onChange={(event) => setSourceId(event.target.value)}
                  value={sourceId}
                >
                  {referenceData.hymnSources.map((source) => (
                    <NativeSelectOption key={source.id} value={source.id}>
                      {source.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="last-played">Last played</FieldLabel>
                <Input
                  id="last-played"
                  onChange={(event) => setLastPlayed(event.target.value)}
                  type="date"
                  value={lastPlayed}
                />
                <FieldDescription>
                  Publishing an order updates this field for hymns selected in
                  that service.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="times-played">
                  Times played last 6 months
                </FieldLabel>
                <Input
                  disabled
                  id="times-played"
                  min={0}
                  readOnly
                  type="number"
                  value={timesPlayedLastSixMonths}
                />
                <FieldDescription>
                  Calculated from published orders of service in the last 6
                  months.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="lyrics">Lyrics markdown</FieldLabel>
                <Textarea
                  id="lyrics"
                  onChange={(event) => setLyricsMarkdown(event.target.value)}
                  rows={14}
                  value={lyricsMarkdown}
                />
                <FieldDescription>
                  Use Markdown for verses, choruses, and notes.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Music key</CardTitle>
              <CardDescription>
                Click a key on the outer circle to set the key signature value.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="music-key">Music Key</FieldLabel>
                  <Input
                    id="music-key"
                    onChange={(event) => setMusicKey(event.target.value)}
                    value={musicKey}
                  />
                  <FieldDescription>
                    Examples: F sets b, G sets #, and A sets ###.
                  </FieldDescription>
                </Field>
                <MusicKeySelector onChange={setMusicKey} value={musicKey} />
              </FieldGroup>
            </CardContent>
          </Card>
        </aside>
      </div>
    </form>
  );
};
