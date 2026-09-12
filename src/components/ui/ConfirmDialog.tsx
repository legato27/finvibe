"use client";

/**
 * ConfirmDialog — the one confirm.
 *
 * Replaces the browser's native confirm(). `useConfirm()` returns a function
 * that resolves to true when the user confirms, so a call site reads:
 *
 *   if (await confirm({ title: t("deletePrompt", { name }), destructive: true })) del.mutate(id);
 *
 * Destructive confirms put initial focus on Cancel and paint the confirm
 * button in the short (caution) tone, never lime: lime is for actions you
 * want, not for deleting things.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

export type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type Ask = (opts: ConfirmOptions | string, extra?: Partial<ConfirmOptions>) => Promise<boolean>;

/** A plain message becomes title + body, split at the first blank line. */
function normalise(o: ConfirmOptions | string, extra?: Partial<ConfirmOptions>): ConfirmOptions {
  if (typeof o !== "string") return { ...o, ...extra };
  const [title, ...rest] = o.split(/\n\s*\n/);
  return { title: title.trim(), body: rest.length ? rest.join("\n\n").trim() : undefined, ...extra };
}

const ConfirmContext = createContext<Ask>(() => Promise.resolve(false));

export function useConfirm(): Ask {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const tc = useTranslations("common");
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const ask = useCallback<Ask>((o, extra) => {
    // A second ask while one is open answers the first with "no".
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOpts(normalise(o, extra));
    });
  }, []);

  const settle = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };

  const destructive = !!opts?.destructive;
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Dialog.Root open={opts !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-background/70 backdrop-blur-sm" />
          <Dialog.Content
            onOpenAutoFocus={(e) => { if (destructive && cancelRef.current) { e.preventDefault(); cancelRef.current.focus(); } }}
            className="card fixed left-1/2 top-1/2 z-[80] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 p-5 shadow-float"
          >
            <Dialog.Title className="text-base font-bold text-foreground">{opts?.title}</Dialog.Title>
            {opts?.body ? (
              <Dialog.Description className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{opts.body}</Dialog.Description>
            ) : (
              <Dialog.Description className="sr-only">{opts?.title}</Dialog.Description>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => settle(false)}
                className="rounded-control border border-border px-3 py-1.5 text-sm font-bold text-foreground hover:border-foreground/40"
              >
                {opts?.cancelLabel ?? tc("cancel")}
              </button>
              <button
                type="button"
                onClick={() => settle(true)}
                className={`rounded-control px-3 py-1.5 text-sm font-bold ${
                  destructive
                    ? "border border-signal-short/50 bg-signal-short-bg text-signal-short hover:border-signal-short"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                }`}
              >
                {opts?.confirmLabel ?? (destructive ? tc("delete") : tc("confirm"))}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ConfirmContext.Provider>
  );
}
