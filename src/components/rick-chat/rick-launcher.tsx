import { useState } from "react";

import { RickChatSheet } from "~/components/rick-chat/rick-chat-sheet";

/**
 * Floating Rick button. The chat (and its WebSocket) only mounts once the user
 * opens the sheet, so idle authenticated pages keep no agent connection open.
 */
export const RickLauncher = ({ userId }: { userId: string }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        aria-label="Chat with Rick"
        className="fixed right-6 bottom-6 z-40 size-14 rounded-full ring-offset-background transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => setOpen(true)}
        title="Chat with Rick"
        type="button"
      >
        <img
          alt=""
          className="size-14 rounded-full shadow-lg"
          height={56}
          src="/rick-avatar.svg"
          width={56}
        />
      </button>
      {open ? (
        <RickChatSheet onOpenChange={setOpen} open={open} userId={userId} />
      ) : null}
    </>
  );
};
