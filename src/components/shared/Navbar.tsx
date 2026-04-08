"use client";
import Link from "next/link";
import { Activity, BarChart2 } from "lucide-react";

export default function Navbar() {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-4 max-w-[1600px] flex items-center h-14 gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-primary">
          <Activity className="w-5 h-5" />
          <span className="font-mono text-sm">VIBEFIN</span>
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
