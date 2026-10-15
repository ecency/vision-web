import { Feedback } from "@/features/shared/feedback";
import { Navbar } from "@/features/shared/navbar";
import { PropsWithChildren } from "react";
import { ChatsClient } from "./_components/chats-client";

export default function Layout(props: PropsWithChildren) {
  return (
    <>
      <Feedback />
      <Navbar />
      <div className="reading-background !min-h-0 [--surface-color:var(--reading-surface-bg)] [--background-color:var(--reading-page-bg)] box-border h-[100dvh] pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-14 md:overflow-hidden md:pb-0 md:pt-[69px]">
        <div className="mx-auto flex h-full min-h-0 max-w-[1800px] px-2 py-2 sm:px-4 md:px-5 md:py-5 xl:px-8">
          <div className="grid h-full min-h-0 w-full min-w-0 grid-cols-1 overflow-hidden rounded-xl border border-[--border-color] reading-surface md:grid-cols-[minmax(270px,30%)_minmax(0,1fr)] md:rounded-2xl xl:grid-cols-[minmax(320px,26%)_minmax(0,1fr)]">
            <div className="hidden min-h-0 min-w-0 border-r border-[--border-color] bg-[--surface-color] md:flex md:flex-col md:overflow-hidden">
              <ChatsClient />
            </div>
            <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden reading-surface">{props.children}</div>
          </div>
        </div>
      </div>
    </>
  );
}
