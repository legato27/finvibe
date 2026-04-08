"use client";
import Link from "next/link";
import Image from "next/image";
import { BarChart2 } from "lucide-react";

export default function Navbar() {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-4 max-w-[1600px] flex items-center h-14 gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image src="/vibefin-icon.svg" alt="VibeFin" width={28} height={28} />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground leading-tight">vibefin</span>
            <span className="text-[10px] text-slate-500 leading-tight hidden sm:block">your daily market vibe check</span>
          </div>
        </Link>

        {/* Nav */}
        <nav className="flex gap-1">
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-primary/20 text-primary"
          >
            <BarChart2 className="w-4 h-4" />
            Dashboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
