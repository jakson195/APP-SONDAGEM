import { redirect } from "next/navigation";
import { isLocalAuthBypassEnabled } from "@/lib/auth-bypass";

export default function Home() {
  redirect(isLocalAuthBypassEnabled() ? "/obras" : "/login");
}
