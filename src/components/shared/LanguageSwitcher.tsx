"use client";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Languages } from "lucide-react";
import { setLocaleCookie } from "@/lib/i18n/actions";

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = locale === "zh" ? "en" : "zh";
    startTransition(async () => {
      await setLocaleCookie(next as "en" | "zh");
      router.refresh();
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
      title={locale === "zh" ? "Switch to English" : "切换到中文"}
    >
      <Languages className="w-4 h-4" />
      <span className="text-[10px] uppercase tracking-wider hidden sm:inline">
        {locale === "zh" ? "中文" : "EN"}
      </span>
    </button>
  );
}
