import { redirect } from "next/navigation";

/** Antiga rota do mapa — o mapa OSM está em `/geo`. */
export default function MapaOsmRedirectPage() {
  redirect("/geo");
}
