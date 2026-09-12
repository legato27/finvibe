import { redirect } from "next/navigation";

// The hub is every screener page; this address just opens the first one.
export default function ScreenersIndex() {
  redirect("/ranked");
}
