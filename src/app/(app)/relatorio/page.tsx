import { redirect } from "next/navigation";

/** O relatório SPT (PDF DataGeo Digital) gera-se em Sondagem SPT. */
export default function RelatorioIndexRedirect() {
  redirect("/spt");
}
