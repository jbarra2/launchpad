"use client";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { apiErrorMessage, apiSend } from "@/lib/api-client";
import { navigate, replaceLocation } from "@/lib/navigate";

interface Props {
  rocketId: string;
  name: string;
}

/** Launch, shown once all six parts are on. The API refuses it otherwise, whatever the page shows. */
export function LaunchButton({ rocketId, name }: Props) {
  return (
    <ConfirmDialog
      trigger="Launch"
      title={`Launch ${name}?`}
      confirmLabel="Launch"
      busyLabel="Launching…"
      description={<p>Launching locks this rocket. Continue?</p>}
      onConfirm={async () => {
        const result = await apiSend("POST", `/api/rockets/${rocketId}/launch`);
        if (result.ok) {
          navigate(`/rockets/${rocketId}?notice=launched`);
          return null;
        }
        return apiErrorMessage(result, "We could not launch it. Try again.");
      }}
    />
  );
}

export function DeleteRocketButton({ rocketId, name }: Props) {
  return (
    <ConfirmDialog
      trigger="Delete idea"
      title={`Delete ${name}?`}
      confirmLabel="Delete idea"
      busyLabel="Deleting…"
      danger
      description={<p>This deletes the idea and all its parts. It cannot be undone.</p>}
      onConfirm={async () => {
        const result = await apiSend("DELETE", `/api/rockets/${rocketId}`);
        if (result.ok) {
          // Replace, so Back does not return to the page of an idea that is gone.
          replaceLocation("/pad?notice=deleted");
          return null;
        }
        return apiErrorMessage(result, "We could not delete it. Try again.");
      }}
    />
  );
}
