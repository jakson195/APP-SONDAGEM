import { redirect } from "next/navigation";

/** O relatório SPT (PDF modelo SOILSUL) gera-se em Sondagem SPT. */
export default function RelatorioIndexRedirect() {
  redirect("/spt");
}
