import { PART_INFO, PART_KINDS, type PartKind } from "@launchpad/shared";

// The rocket, in flat shapes. One group per part: an attached part is filled with the accent
// gradient, and a missing one is a dashed outline. The gradient is decoration only and never sits
// behind text. It renders on the server, with no script.

const SHAPES: Record<PartKind, string[]> = {
  engine: ["M46 180 H74 L80 200 H40 Z"],
  fuel: ["M40 142 H80 V178 H40 Z"],
  body: ["M40 100 H80 V140 H40 Z"],
  avionics: ["M40 62 H80 V98 H40 Z"],
  fins: ["M40 140 L18 188 L40 178 Z", "M80 140 L102 188 L80 178 Z"],
  nose: ["M60 8 C72 22 80 40 80 60 H40 C40 40 48 22 60 8 Z"],
};

/** "Rocket, 2 of 6 parts: Engine, Fuel tank" */
export function rocketLabel(parts: readonly PartKind[]): string {
  const on = PART_KINDS.filter((kind) => parts.includes(kind));
  const names = on.map((kind) => PART_INFO[kind].name).join(", ");
  const count = `Rocket, ${on.length} of ${PART_KINDS.length} parts`;
  return names ? `${count}: ${names}` : count;
}

interface RocketProps {
  parts: readonly PartKind[];
  /** Makes the gradient's id unique on a page that shows several rockets. Letters and digits. */
  idPrefix: string;
  size?: "small" | "large";
  label?: string;
}

export function Rocket({ parts, idPrefix, size = "large", label }: RocketProps) {
  const gradient = `rocket-fill-${idPrefix.replace(/[^a-z0-9-]/gi, "")}`;
  return (
    <svg
      viewBox="0 0 120 210"
      role="img"
      aria-label={label ?? rocketLabel(parts)}
      className={`rocket rocket-${size}`}
      focusable="false"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="rocket-stop-start" />
          <stop offset="1" className="rocket-stop-end" />
        </linearGradient>
      </defs>
      {PART_KINDS.map((kind) => {
        const on = parts.includes(kind);
        return (
          <g
            key={kind}
            data-part={kind}
            data-state={on ? "on" : "missing"}
            className={on ? "rocket-part" : "rocket-part rocket-ghost"}
          >
            {SHAPES[kind].map((d) => (
              <path key={d} d={d} fill={on ? `url(#${gradient})` : "none"} />
            ))}
            {kind === "avionics" ? (
              <circle cx="60" cy="80" r="8" className="rocket-window" />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
