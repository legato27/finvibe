import { notFound } from "next/navigation";
import { CRYPTO_MODULE_ENABLED } from "@/modules/crypto/flag";
import { ScalpDeskPage } from "@/modules/crypto/components/ScalpDeskPage";

// Desk → Scalp: the crypto module's second surface; remove with the module.
export default function Page() {
  if (!CRYPTO_MODULE_ENABLED) notFound();
  return <ScalpDeskPage />;
}
