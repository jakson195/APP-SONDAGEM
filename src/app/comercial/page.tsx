import { redirect } from "next/navigation";

/** Alias legível: /comercial → landing na raiz. */
export default function ComercialPage() {
  redirect("/");
}
