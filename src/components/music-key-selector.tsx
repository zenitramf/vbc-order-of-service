/* oxlint-disable jsx-a11y/prefer-tag-over-role -- SVG paths need button semantics for clickable circle sectors. */
import * as React from "react";

import { MUSIC_KEY_OPTIONS } from "~/lib/music-keys";

interface MusicKeySelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const CENTER_X = 1396;
const CENTER_Y = 1216;
const OUTER_RADIUS = 895;
const MAJOR_INNER_RADIUS = 610;
const MINOR_INNER_RADIUS = 410;
const SECTOR_HALF_ANGLE = 15;
const TEXT_RADIUS = 755;
const RELATIVE_TEXT_RADIUS = 510;

const normaliseMusicKey = (value: string) => value.trim();

const getOptionForValue = (value: string) => {
  const normalisedValue = normaliseMusicKey(value);

  return MUSIC_KEY_OPTIONS.find(
    (option) =>
      option.value === normalisedValue ||
      option.aliases?.includes(normalisedValue)
  );
};

const getCenterAngle = (index: number) => -90 + index * 30;

const polarPoint = (radius: number, angle: number) => {
  const radians = (angle * Math.PI) / 180;

  return {
    x: CENTER_X + radius * Math.cos(radians),
    y: CENTER_Y + radius * Math.sin(radians),
  };
};

const getAnnularSectorPath = (
  centerAngle: number,
  innerRadius: number,
  outerRadius: number
) => {
  const startAngle = centerAngle - SECTOR_HALF_ANGLE;
  const endAngle = centerAngle + SECTOR_HALF_ANGLE;
  const outerStart = polarPoint(outerRadius, startAngle);
  const outerEnd = polarPoint(outerRadius, endAngle);
  const innerStart = polarPoint(innerRadius, startAngle);
  const innerEnd = polarPoint(innerRadius, endAngle);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 0 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
};

const getTextPoint = (radius: number, centerAngle: number) =>
  polarPoint(radius, centerAngle);

interface SelectedKeyLabelProps {
  angle: number;
  label: string;
  radius: number;
}

const SelectedKeyLabel = ({ angle, label, radius }: SelectedKeyLabelProps) => {
  const { x, y } = getTextPoint(radius, angle);

  return (
    <text
      dominantBaseline="middle"
      fill="#fff"
      fontFamily="Inter, sans-serif"
      fontSize={label.length > 2 ? 95 : 130}
      textAnchor="middle"
      transform={`rotate(${angle + 90} ${x} ${y})`}
      x={x}
      y={y}
    >
      {label}
    </text>
  );
};

export const MusicKeySelector = ({
  onChange,
  value,
}: MusicKeySelectorProps) => {
  const selectedOption = getOptionForValue(value);
  const selectedIndex = selectedOption
    ? MUSIC_KEY_OPTIONS.indexOf(selectedOption)
    : -1;
  const selectedCenterAngle =
    selectedIndex >= 0 ? getCenterAngle(selectedIndex) : null;

  const handleKeyDown = (
    event: React.KeyboardEvent<SVGPathElement>,
    optionValue: string
  ) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onChange(optionValue);
  };

  return (
    <svg
      aria-label="Circle of fifths music key selector"
      className="aspect-square w-full"
      viewBox="501 321 1790 1790"
    >
      <defs>
        <clipPath id="circle-of-fifths-crop">
          <circle cx={CENTER_X} cy={CENTER_Y} r={OUTER_RADIUS} />
        </clipPath>
      </defs>
      <image
        clipPath="url(#circle-of-fifths-crop)"
        height="2666"
        href="/cof-2.svg"
        width="2792"
        x="0"
        y="0"
      />

      {selectedOption && selectedCenterAngle !== null ? (
        <g aria-hidden="true" pointerEvents="none">
          <path
            d={getAnnularSectorPath(
              selectedCenterAngle,
              MAJOR_INNER_RADIUS,
              OUTER_RADIUS
            )}
            fill="#5ec946"
            stroke="#000"
            strokeWidth="10"
          />
          <path
            d={getAnnularSectorPath(
              selectedCenterAngle,
              MINOR_INNER_RADIUS,
              MAJOR_INNER_RADIUS
            )}
            fill="#24551f"
            stroke="#000"
            strokeWidth="10"
          />
          <SelectedKeyLabel
            angle={selectedCenterAngle}
            label={selectedOption.label}
            radius={TEXT_RADIUS}
          />
          <SelectedKeyLabel
            angle={selectedCenterAngle}
            label={selectedOption.relativeLabel}
            radius={RELATIVE_TEXT_RADIUS}
          />
        </g>
      ) : null}

      {MUSIC_KEY_OPTIONS.map((option, index) => {
        const centerAngle = getCenterAngle(index);
        const selected = selectedOption?.value === option.value;

        return (
          <path
            aria-label={`Select ${option.label} major (${option.value || "C"})`}
            aria-pressed={selected}
            className="cursor-pointer fill-transparent outline-none transition-colors hover:fill-primary/20 focus-visible:fill-primary/20"
            d={getAnnularSectorPath(
              centerAngle,
              MAJOR_INNER_RADIUS,
              OUTER_RADIUS
            )}
            key={option.label}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, option.value)}
            role="button"
            tabIndex={0}
          />
        );
      })}
    </svg>
  );
};
