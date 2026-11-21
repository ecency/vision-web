import { Feedback } from "@/features/shared/feedback";
import { Navbar } from "@/features/shared/navbar";
import { ScrollToTop } from "@/features/shared/scroll-to-top";
import { PropsWithChildren } from "react";

export default function Layout({ children }: PropsWithChildren) {
  return (
    <div className="reading-background pt-[63px] md:pt-[69px] pb-24 md:pb-16">
      <ScrollToTop />
      <Feedback />
      <Navbar />
      {children}
    </div>
  );
}
