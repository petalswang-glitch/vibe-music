"use client";

import dynamic from "next/dynamic";
import { Bot } from "lucide-react";
import { useRef, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { AuthDialog } from "@/components/auth-dialog";

const AgentPanel = dynamic(
  () => import("./agent-panel").then((module) => module.AgentPanel),
  {
    ssr: false,
    loading: () => (
      <p
        role="status"
        className="fixed bottom-24 right-6 z-[100] rounded-xl border bg-background p-4 text-sm shadow-paper"
      >
        正在打开 VibeAgent…
      </p>
    ),
  },
);

export function AgentChat() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  const viewer = user ? `user-${user.userId}` : "guest";
  return (
    <AgentLauncher key={viewer} viewer={viewer} loggedIn={Boolean(user)} />
  );
}

function AgentLauncher({
  viewer,
  loggedIn,
}: {
  viewer: string;
  loggedIn: boolean;
}) {
  const [authOpen, setAuthOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  return (
    <>
      {!open && (
        <button
          ref={trigger}
          aria-label="打开 VibeAgent"
          onClick={() => {
            if (!loggedIn) {
              setAuthOpen(true);
              return;
            }
            setStarted(true);
            setOpen(true);
          }}
          className="fixed bottom-24 right-6 z-[100] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition-transform hover:scale-110 motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <Bot size={26} aria-hidden="true" />
        </button>
      )}
      {started && <AgentPanel open={open} onClose={close} viewer={viewer} />}
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
    </>
  );
}
