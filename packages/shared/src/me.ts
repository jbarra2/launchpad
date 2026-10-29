import { z } from "zod";
import { apiKeyState } from "./claude.js";

// The signed-in person. No schema in this package has a field for a password, a token, or a Claude
// key, so none of them can be returned through a response that is parsed with one.
export const meResponse = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  /** Whether a Claude key is saved and works, and its last 4 characters. Never the key. */
  apiKey: apiKeyState,
});

export type MeResponse = z.infer<typeof meResponse>;
