import { redirect } from "next/navigation";

// One stock page. The held-position sections render on /stock/[ticker]
// when the ticker is in a portfolio; this route only forwards old links.
export default async function PortfolioStockRedirect({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  redirect(`/stock/${ticker.toUpperCase()}`);
}
