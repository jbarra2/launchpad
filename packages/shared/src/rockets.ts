import { z } from "zod";
import { hasInvisible } from "./text.js";

// The contract for ideas (rockets) and their six parts, used by the forms, the API, and the files a
// rocket exports. Every text field has a cap, and each refusal is a sentence a person can act on.

/** The six parts, bottom to top. They are attached in this order. */
export const PART_KINDS = ["engine", "fuel", "body", "avionics", "fins", "nose"] as const;
export type PartKind = (typeof PART_KINDS)[number];

/** Each part keeps its rocket name, with the plan section it holds beside it. */
export const PART_INFO: Readonly<Record<PartKind, { name: string; section: string }>> = {
  engine: { name: "Engine", section: "The idea" },
  fuel: { name: "Fuel tank", section: "Problem & people" },
  body: { name: "Body", section: "Features" },
  avionics: { name: "Avionics", section: "Tech & data" },
  fins: { name: "Fins", section: "Risks & unknowns" },
  nose: { name: "Nose cone", section: "Build plan" },
};

/** "Fuel tank · Problem & people" */
export function partLabel(kind: PartKind): string {
  return `${PART_INFO[kind].name} · ${PART_INFO[kind].section}`;
}

/** A guard on public sign-up. Every idea counts, launched or not. */
export const ROCKET_LIMIT = 20;
export const ROCKET_NAME_MAX = 80;
export const PITCH_MAX = 200;
export const SUMMARY_MAX = 600;
export const POINTS_MAX = 8;
export const POINT_MAX = 200;

export const ROCKET_STATUSES = ["building", "launched"] as const;
export type RocketStatus = (typeof ROCKET_STATUSES)[number];

export const PART_SOURCES = ["chat", "manual"] as const;
export type PartSource = (typeof PART_SOURCES)[number];

/**
 * The part a person may write next, or null once all six are on. Parts are only ever added in
 * order, so the attached ones are always the first few kinds.
 */
export function nextPartKind(attached: readonly PartKind[]): PartKind | null {
  return PART_KINDS.find((kind) => !attached.includes(kind)) ?? null;
}

/** A part may be written if it is on already (an edit) or is the next one. */
export function canWritePart(attached: readonly PartKind[], kind: PartKind): boolean {
  return attached.includes(kind) || nextPartKind(attached) === kind;
}

// A line break of any kind, or a control character such as a tab or an escape code. A name, a
// pitch, or a point is a single line, so none of them may hold one.
const NOT_ONE_LINE = /[\p{Cc}\u2028\u2029]/u;
// A summary may run over several lines and hold a pasted tab, so only the other control characters
// are refused.
const CONTROL_EXCEPT_NEWLINE = /[^\P{Cc}\n\t]|[\u2028\u2029]/u;

const invisibleMessage = (field: string) =>
  `The ${field} has invisible characters in it. Type it again instead of pasting it.`;

function oneLine(field: string, max: number, missing: string) {
  return z
    .string({ error: missing })
    .trim()
    .min(1, missing)
    .max(max, `Use ${max} characters or fewer for the ${field}.`)
    .refine((value) => !NOT_ONE_LINE.test(value), `Keep the ${field} to one line.`)
    .refine((value) => !hasInvisible(value), invisibleMessage(field));
}

/**
 * Text that may run over several lines, such as a summary or a chat message. Windows line breaks
 * are stored as plain ones, so the same text is the same length everywhere, and a pasted tab is
 * fine. Other control characters and invisible ones are refused.
 */
export function multiLineText(field: string, max: number, missing: string) {
  return z
    .string({ error: missing })
    .transform((value) => value.replace(/\r\n?/g, "\n").trim())
    .pipe(
      z
        .string()
        .min(1, missing)
        .max(max, `Use ${max} characters or fewer for the ${field}.`)
        .refine(
          (value) => !CONTROL_EXCEPT_NEWLINE.test(value),
          `Take out the special characters in the ${field}.`,
        )
        .refine((value) => !hasInvisible(value), invisibleMessage(field)),
    );
}

const rocketName = oneLine("name", ROCKET_NAME_MAX, "Enter a name for the idea.");
const pitch = oneLine("pitch", PITCH_MAX, "Enter a one-line pitch.");

// Optional on the form, which sends an empty box as "". The "why" becomes the Engine's first point,
// so it has a point's limits.
const why = z
  .string({ error: "Say why it matters in words, or leave it empty." })
  .trim()
  .max(POINT_MAX, `Use ${POINT_MAX} characters or fewer for why it matters.`)
  .refine((value) => !NOT_ONE_LINE.test(value), "Keep why it matters to one line.")
  .refine((value) => !hasInvisible(value), invisibleMessage("why"))
  .optional()
  .transform((value) => (value ? value : undefined));

const summary = multiLineText("summary", SUMMARY_MAX, "Write a summary.");

const point = oneLine("point", POINT_MAX, "A point cannot be empty.");

const points = z
  .array(point, { error: "Send the points as a list." })
  .max(POINTS_MAX, `Use ${POINTS_MAX} points or fewer.`);

// Every body schema is strict: a field the form does not have is refused, not ignored. Who owns an
// idea comes from the session, never from a body.
export const createRocketBody = z.strictObject({
  name: rocketName,
  pitch,
  why,
});

// An idea's id, and a chat session's, as the database makes them (a cuid). Anything else cannot
// name one, so it is a 404 before any query, and a page never builds an address from it.
export const rocketIdParam = z.string().regex(/^[a-z0-9]{1,40}$/);
export const sessionIdParam = z.string().regex(/^[a-z0-9]{1,40}$/);

// A part written by hand, or a draft from a chat session being attached. With a session, the part
// is written from that session and the session closes in the same write.
export const partBody = z.strictObject({
  summary,
  points,
  sessionId: sessionIdParam.optional(),
});

export const rocketListQuery = z.strictObject({
  status: z.enum(ROCKET_STATUSES, { error: "Ask for building or launched ideas." }).optional(),
});

export const partKindParam = z.enum(PART_KINDS);

export type CreateRocketBody = z.infer<typeof createRocketBody>;
export type PartBody = z.infer<typeof partBody>;
export type RocketListQuery = z.infer<typeof rocketListQuery>;

// What the API answers. Each answer is parsed with one of these before it leaves, so a field the
// schema does not list (the owner's id, for one) cannot go out by accident. Times are ISO strings.
const isoTime = z.iso.datetime();

export const partResponse = z.object({
  kind: z.enum(PART_KINDS),
  summary: z.string(),
  points: z.array(z.string()),
  source: z.enum(PART_SOURCES),
  updatedAt: isoTime,
});

export const rocketSummary = z.object({
  // Pages build addresses from these ids, so an answer may carry only an id in the shape the
  // database makes, the same as an address may.
  id: rocketIdParam,
  name: z.string(),
  status: z.enum(ROCKET_STATUSES),
  /** The kinds that are on, in order. */
  parts: z.array(z.enum(PART_KINDS)),
  launchedAt: isoTime.nullable(),
  updatedAt: isoTime,
});

export const rocketList = z.object({
  rockets: z.array(rocketSummary),
});

export const rocketDetail = z.object({
  id: rocketIdParam,
  name: z.string(),
  pitch: z.string(),
  status: z.enum(ROCKET_STATUSES),
  /** The parts that are on, in order. */
  parts: z.array(partResponse),
  /** The chat session open for the next part, if there is one. */
  openSession: z.object({ id: sessionIdParam, part: z.enum(PART_KINDS) }).nullable(),
  launchedAt: isoTime.nullable(),
  createdAt: isoTime,
  updatedAt: isoTime,
});

export type PartResponse = z.infer<typeof partResponse>;
export type RocketSummary = z.infer<typeof rocketSummary>;
export type RocketList = z.infer<typeof rocketList>;
export type RocketDetail = z.infer<typeof rocketDetail>;

// The two files a rocket exports. Built from the parts with a template, with no Claude call, so the
// API and the tests share one copy.

export const PLAN_FILE = "PLAN.md";
export const KICKOFF_FILE = "KICKOFF.md";

export const NOT_WRITTEN = "_Not written yet._";

type PlanSource = Pick<RocketDetail, "name" | "pitch"> & {
  parts: readonly Pick<PartResponse, "kind" | "summary" | "points">[];
};

export function buildPlanMarkdown(rocket: PlanSource): string {
  const sections = PART_KINDS.map((kind) => {
    const part = rocket.parts.find((p) => p.kind === kind);
    const heading = `## ${PART_INFO[kind].section}`;
    if (!part) {
      return `${heading}\n\n${NOT_WRITTEN}`;
    }
    const list = part.points.map((p) => `- ${p}`).join("\n");
    return list ? `${heading}\n\n${part.summary}\n\n${list}` : `${heading}\n\n${part.summary}`;
  });
  return `# ${rocket.name}\n\n> ${rocket.pitch}\n\n${sections.join("\n\n")}\n`;
}

export const KICKOFF_INTRO =
  'I\'m starting a new project. The plan is below. Read it, then propose the project skeleton and a first sprint built from the "Build plan" section. Ask before choosing anything the plan leaves open.';

export function buildKickoffMarkdown(rocket: PlanSource): string {
  return `${KICKOFF_INTRO}\n\n---\n\n${buildPlanMarkdown(rocket)}`;
}
