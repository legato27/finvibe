import { notFound } from "next/navigation";
import { CryptoDeskPage } from "@/modules/crypto/components/CryptoDeskPage";
import { CRYPTO_MODULE_ENABLED } from "@/modules/crypto/flag";

// Desk → Crypto. The whole page lives in src/modules/crypto; this file is the
// route and the switch. Delete both to retire the module.
export default function Page() {
  if (!CRYPTO_MODULE_ENABLED) notFound();
  return <CryptoDeskPage />;
}
