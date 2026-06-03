/**
 * Galeria da página comercial — imagens de sondagem em campo.
 *
 * Para usar fotos suas:
 * 1. Copie JPG/PNG/WebP para `public/marketing/sondagens/`
 * 2. Atualize `src` para `/marketing/sondagens/nome-do-ficheiro.jpg`
 * 3. Ajuste `alt` e `caption`
 */

export type SondagemGalleryTag = "SPT" | "Trado" | "Rotativa" | "Poços" | "Campo" | "Relatório";

export type SondagemGalleryItem = {
  id: string;
  /** Caminho local (/marketing/...) ou URL https */
  src: string;
  alt: string;
  caption: string;
  tag: SondagemGalleryTag;
  /** Destaque na grelha (maior) */
  featured?: boolean;
};

export const SONDAGEM_GALLERY_IMAGES: SondagemGalleryItem[] = [
  {
    id: "spt-campo",
    src: "https://images.unsplash.com/photo-1581094794329-c8112a89ed8d?w=1200&q=80",
    alt: "Equipa de sondagem SPT em obra de infraestrutura",
    caption: "Registo SPT em campo — NSPT, amostras e coordenadas por furo",
    tag: "SPT",
    featured: true,
  },
  {
    id: "trado-obra",
    src: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&q=80",
    alt: "Operação de sondagem mecânica em terreno",
    caption: "Sondagem trado / rotativa ligada à obra no dashboard",
    tag: "Trado",
    featured: true,
  },
  {
    id: "perfil-laboratorio",
    src: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1200&q=80",
    alt: "Perfil estratigráfico e interpretação geológica",
    caption: "Perfil estratigráfico e secções geológicas no escritório",
    tag: "Relatório",
  },
  {
    id: "obra-infra",
    src: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1200&q=80",
    alt: "Obra de infraestrutura com investigação geotécnica",
    caption: "Multi-obra: cada frente com furos, mapas e relatórios isolados",
    tag: "Campo",
  },
  {
    id: "poços-monitor",
    src: "https://images.unsplash.com/photo-1590644366585-68bf827f2f4a?w=1200&q=80",
    alt: "Poços e monitoramento hidrogeológico em campo",
    caption: "Poços, níveis piezométricos e mapa de carga hidráulica",
    tag: "Poços",
  },
  {
    id: "relatorio-cliente",
    src: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80",
    alt: "Entrega de relatório técnico ao cliente",
    caption: "PDF e portal do cliente com a marca da consultoria",
    tag: "Relatório",
  },
];
