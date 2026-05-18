import { redirect } from "next/navigation";

/** A secção geológica vive em `/perfil-estratigrafico`. */
export default function SecaoGeologicaRedirectPage() {
  redirect("/perfil-estratigrafico");
}
