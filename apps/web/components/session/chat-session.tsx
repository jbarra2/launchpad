"use client";

import {
  chatSession,
  measuredLength,
  MESSAGE_MAX,
  messageBody,
  PART_INFO,
  partDraft,
  sentMessages,
  type ApiKeyState,
  type ChatSession,
  type PartDraft,
} from "@launchpad/shared";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { textCount } from "@/components/a11y/field-count";
import { FormField } from "@/components/a11y/form-field";
import { useAnnouncer } from "@/components/a11y/live-region";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PartForm } from "@/components/rockets/part-form";
import { apiSend, claudeErrorMessage } from "@/lib/api-client";
import { navigate } from "@/lib/navigate";

export const THINKING = "Claude is thinking…";
const UNREADABLE = "Claude's answer could not be shown. Reload the page.";
const COMPOSER = "chat-composer";

interface Props {
  rocketId: string;
  session: ChatSession;
  keyStatus: ApiKeyState["status"];
}

/**
 * The open chat session: the conversation, the box to answer in, and the draft of the part once the
 * person asks for it. Claude's words are shown as text, never as markup.
 */
export function ChatSessionView({ rocketId, session, keyStatus }: Props) {
  const [messages, setMessages] = useState(session.messages);
  const [draft, setDraft] = useState<PartDraft | null>(null);
  const [waiting, setWaiting] = useState<"reply" | "draft" | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [failure, setFailure] = useState("");
  const [length, setLength] = useState(0);
  const [typed, setTyped] = useState(false);
  const pending = useRef(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const draftHeading = useRef<HTMLHeadingElement>(null);
  const announce = useAnnouncer();
  const { name } = PART_INFO[session.part];

  // The page scrolls to its end, where the newest message sits just above the answer box, which
  // stays at the bottom of the screen and would cover a message scrolled only to the screen's edge.
  // Focus stays where the person is.
  useEffect(() => {
    composerRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (draft) {
      draftHeading.current?.focus();
    }
  }, [draft]);

  /** Runs one call to Claude at a time, with the thinking status shown and announced. */
  async function withClaude(kind: "reply" | "draft", run: () => Promise<void>) {
    if (pending.current) {
      return;
    }
    pending.current = true;
    setWaiting(kind);
    setFailure("");
    announce(kind === "reply" ? THINKING : `Claude is writing the ${name}…`);
    try {
      await run();
    } finally {
      pending.current = false;
      setWaiting(null);
    }
  }

  async function onSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) {
      return;
    }
    const field = event.currentTarget.elements.namedItem("text") as HTMLTextAreaElement;
    const parsed = messageBody.safeParse({ text: field.value });
    if (!parsed.success) {
      flushSync(() => setFieldError(parsed.error.issues[0]?.message));
      field.focus();
      return;
    }
    setFieldError(undefined);
    await withClaude("reply", async () => {
      const result = await apiSend("POST", `/api/sessions/${session.id}/messages`, parsed.data);
      if (!result.ok) {
        // The words stay in the box, so the person can send them again.
        setFailure(claudeErrorMessage(result, "Your message could not be sent. Try again."));
        return;
      }
      const answer = sentMessages.safeParse(result.data);
      if (!answer.success) {
        setFailure(UNREADABLE);
        return;
      }
      setMessages((last) => [...last, ...answer.data.messages]);
      field.value = "";
      setLength(0);
      setTyped(false);
      const reply = answer.data.messages.at(-1);
      if (reply) {
        announce(`Claude: ${reply.text}`);
      }
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    // On a touch screen Enter adds a line, and the Send button sends.
    if (window.matchMedia?.("(pointer: coarse)").matches) {
      return;
    }
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  async function buildDraft() {
    await withClaude("draft", async () => {
      const result = await apiSend("POST", `/api/sessions/${session.id}/draft`);
      if (!result.ok) {
        setFailure(claudeErrorMessage(result, "Claude could not write the draft. Try again."));
        return;
      }
      const parsed = partDraft.safeParse(result.data);
      if (!parsed.success) {
        setFailure(UNREADABLE);
        return;
      }
      setDraft(parsed.data);
      announce(`Claude's draft of the ${name} is ready. Edit it, then attach it.`);
    });
  }

  // The first question did not come through when the session opened. Asking again opens nothing new,
  // unless this session ended meanwhile (in another tab), in which case the page loads afresh.
  async function askForOpener() {
    await withClaude("reply", async () => {
      const result = await apiSend("POST", `/api/rockets/${rocketId}/sessions`);
      if (!result.ok) {
        setFailure(claudeErrorMessage(result, "Claude could not start. Try again."));
        return;
      }
      const parsed = chatSession.safeParse(result.data);
      if (!parsed.success) {
        setFailure(UNREADABLE);
        return;
      }
      if (parsed.data.id !== session.id) {
        navigate(`/rockets/${rocketId}/session`);
        return;
      }
      flushSync(() => setMessages(parsed.data.messages));
      textRef.current?.focus();
      const opener = parsed.data.messages.at(-1);
      if (opener) {
        announce(`Claude: ${opener.text}`);
      }
    });
  }

  function backToChat() {
    flushSync(() => setDraft(null));
    textRef.current?.focus();
  }

  const busy = waiting !== null || undefined;

  return (
    <>
      {keyStatus === "valid" ? null : (
        <p className="notice">
          {keyStatus === "invalid"
            ? "Your Claude key no longer works. "
            : "Your Claude key is no longer saved. "}
          <Link href="/settings">Go to Settings</Link> to add one, or write the part yourself.
        </p>
      )}
      <ol className="transcript" aria-label="Conversation with Claude">
        {messages.map((message) => (
          <li key={message.id} className={`message message-${message.role}`}>
            <p className="message-author">{message.role === "assistant" ? "Claude" : "You"}</p>
            <p className="message-text">{message.text}</p>
          </li>
        ))}
      </ol>
      {messages.length === 0 ? (
        <div className="chat-empty">
          <p role="status">Claude has not asked its first question yet.</p>
          <button type="button" className="button" aria-disabled={busy} onClick={askForOpener}>
            Ask Claude to start
          </button>
        </div>
      ) : null}
      {draft ? (
        <section aria-labelledby="draft-heading" className="draft">
          <h2 id="draft-heading" tabIndex={-1} ref={draftHeading}>
            Draft: {name}
          </h2>
          <p className="muted">Edit anything, then attach it. Nothing is saved until you do.</p>
          <PartForm
            rocketId={rocketId}
            kind={session.part}
            initial={draft}
            draft={{ sessionId: session.id, onBackToChat: backToChat }}
          />
        </section>
      ) : null}
      {/* Hidden, not removed, while the draft is open, so an answer not sent yet is kept. The
          dialog that ends the session has a form of its own, so it sits outside this one. */}
      <div ref={composerRef} className="composer" hidden={draft !== null}>
        <form
          id={COMPOSER}
          method="post"
          noValidate
          aria-label="Message to Claude"
          onSubmit={onSend}
        >
          <FormField
            label="Your answer"
            error={fieldError}
            count={textCount(length, MESSAGE_MAX, "Your answer", !typed)}
          >
            <textarea
              ref={textRef}
              name="text"
              rows={3}
              onChange={(event) => {
                setTyped(true);
                setLength(measuredLength(event.currentTarget.value));
              }}
              onKeyDown={onKeyDown}
            />
          </FormField>
          <p className="chat-status" aria-hidden="true">
            {waiting === "reply" ? THINKING : waiting === "draft" ? `Writing the ${name}…` : ""}
          </p>
          <p role="alert" className="inline-alert">
            {failure}
          </p>
        </form>
        <div className="composer-actions">
          <button type="submit" form={COMPOSER} className="button" aria-disabled={busy}>
            {waiting === "reply" ? "Sending…" : "Send"}
          </button>
          <button
            type="button"
            className="button button-secondary"
            aria-disabled={busy}
            onClick={buildDraft}
          >
            {waiting === "draft" ? "Building…" : "Build this part"}
          </button>
          <EndSessionButton rocketId={rocketId} sessionId={session.id} name={name} />
        </div>
      </div>
    </>
  );
}

function EndSessionButton({
  rocketId,
  sessionId,
  name,
}: {
  rocketId: string;
  sessionId: string;
  name: string;
}) {
  return (
    <ConfirmDialog
      trigger="End session"
      title="End this session?"
      confirmLabel="End session"
      busyLabel="Ending…"
      description={
        <>
          <p>
            {`Once you end it, you can't come back to this chat, and a new session for the ${name} starts over without these messages.`}
          </p>
          <p>
            Nothing is attached. To keep what you&apos;ve worked out, choose Build this part, then
            Attach part.
          </p>
        </>
      }
      onConfirm={async () => {
        const result = await apiSend("POST", `/api/sessions/${sessionId}/close`);
        if (result.ok) {
          navigate(`/rockets/${rocketId}?notice=ended`);
          return null;
        }
        return claudeErrorMessage(result, "We could not end the session. Try again.");
      }}
    />
  );
}
