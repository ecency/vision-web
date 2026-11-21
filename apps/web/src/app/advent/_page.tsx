"use client";

import { adventFont } from "@/features/advent/font";
import { AdventCalendar } from "./_components/advent-calendar";
import "@/features/advent/advent.scss";

export function AdventPage() {
  return (
    <div className="container mx-auto max-w-[1100px] px-0 py-4 sm:px-4" style={adventFont}>
      <AdventCalendar />
    </div>
  );
}
