"use client";

import { disconnectIntegration } from "./actions";

export function DisconnectButton({
  provider,
  displayName,
}: {
  provider: string;
  displayName: string;
}) {
  return (
    <form
      action={disconnectIntegration}
      onSubmit={(e) => {
        if (
          !confirm(
            `Disconnect ${displayName}? Tokens will be cleared and sync will stop.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="provider" value={provider} />
      <button
        type="submit"
        className="dt-btn"
        style={{ fontSize: 11.5, padding: "6px 10px" }}
      >
        Disconnect
      </button>
    </form>
  );
}
