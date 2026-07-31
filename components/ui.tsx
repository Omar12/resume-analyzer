import { PropsWithChildren } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: Array<string | false | null | undefined>) {
  return twMerge(clsx(inputs));
}

export function Card({
  className,
  children
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-black/10 bg-white/80 p-6 shadow-panel backdrop-blur",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Pill({
  children,
  tone = "default"
}: PropsWithChildren<{ tone?: "default" | "good" | "warn" | "bad" }>) {
  const tones = {
    default: "bg-black/5 text-black/70",
    good: "bg-pine/10 text-pine",
    warn: "bg-rust/10 text-rust",
    bad: "bg-red-100 text-red-700"
  };

  return (
    <span className={cn("rounded-full px-3 py-1 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}
