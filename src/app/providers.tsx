"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { ThemeProvider } from "@/components/shared/ThemeProvider";
import Navbar from "@/components/shared/Navbar";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, retry: 2 },
        },
      })
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ConfirmProvider>
        <div className="flex min-h-screen flex-col">
          {/* The header carries the freshness chip: it turns amber and names
              the oldest data whenever the proxy answered from the staging
              tier, so nothing else on the page needs a banner. */}
          <Navbar />
          <main className="container mx-auto max-w-[1600px] flex-1 px-4 py-6">
            {children}
          </main>
        </div>
        </ConfirmProvider>
        {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
