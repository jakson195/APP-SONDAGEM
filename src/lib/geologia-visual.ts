type GeologiaVisual = {
  backgroundColor: string;
  backgroundImage?: string;
  backgroundSize?: string;
};

/**
 * Hachuras e cores de materiais geológicos para manter padrão visual
 * consistente entre SPT, rotativa, piezômetro e perfis/PDFs.
 */
export function geologiaVisual(
  material: string,
  fallbackColor = "#e7e5e4",
): GeologiaVisual {
  const n = material.trim().toLowerCase();
  if (!n) return { backgroundColor: fallbackColor };

  if (n === "argila" || (n.includes("argila") && !n.includes("rocha"))) {
    return {
      backgroundColor: "#81d4fa",
      backgroundImage:
        "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 4px)",
    };
  }
  if (n.includes("rocha alterada") || n.includes("rocha alter")) {
    return {
      backgroundColor: "#a1887f",
      backgroundImage:
        "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.2) 3px, rgba(0,0,0,0.2) 4px)",
      backgroundSize: "100% 6px",
    };
  }
  if (n.includes("rocha sã") || n.includes("rocha sa") || n === "rocha sã") {
    return {
      backgroundColor: "#374151",
      backgroundImage:
        "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.2) 4px, rgba(255,255,255,0.2) 5px)",
    };
  }
  if (n.includes("silte")) {
    return {
      backgroundColor: "#ffab91",
      backgroundImage:
        "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.32) 2px, rgba(0,0,0,0.32) 3px)",
      backgroundSize: "100% 6px",
    };
  }
  if (n.includes("areia")) {
    const coarse =
      n.includes("grossa") || n.includes("cascalho") || n.includes("pedreg");
    return {
      backgroundColor: coarse ? "#fbc02d" : "#ffee58",
      backgroundImage:
        "radial-gradient(circle, rgba(0,0,0,0.45) 0.75px, transparent 1.2px)",
      backgroundSize: coarse ? "4px 4px" : "5px 5px",
    };
  }
  if (n.includes("cascalho") || n.includes("pedregulho") || n.includes("gravoso")) {
    return {
      backgroundColor: "#90a4ae",
      backgroundImage:
        "radial-gradient(circle, rgba(38,50,56,0.8) 1px, transparent 1.8px)",
      backgroundSize: "7px 7px",
    };
  }
  if (n.includes("orgânico") || n.includes("organico")) {
    return {
      backgroundColor: "#2e7d32",
      backgroundImage:
        "repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(255,255,255,0.18) 4px, rgba(255,255,255,0.18) 5px)",
    };
  }
  if (n.includes("diab") || n.includes("basalt") || n.includes("serra geral")) {
    return {
      backgroundColor: "#c62828",
      backgroundImage:
        "repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,0,0,0.25) 2px, rgba(0,0,0,0.25) 4px)",
    };
  }
  if (n.includes("metamorf") || n.includes("contato")) {
    return {
      backgroundColor: "#5d4037",
      backgroundImage:
        "repeating-linear-gradient(45deg, #6d4c41, #6d4c41 3px, #4e342e 3px, #4e342e 6px)",
    };
  }
  if (n.includes("barreiras") || n.includes("rio bonito") || n.includes("palermo")) {
    return {
      backgroundColor: n.includes("silt") ? "#66bb6a" : "#fdd835",
      backgroundImage: n.includes("silt")
        ? "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.2) 2px, rgba(0,0,0,0.2) 3px)"
        : "radial-gradient(circle, rgba(0,0,0,0.35) 0.8px, transparent 1.2px)",
      backgroundSize: n.includes("silt") ? "100% 5px" : "5px 5px",
    };
  }
  if (n.includes("metassed") || n.includes("brusque") || n.includes("phyllite")) {
    return {
      backgroundColor: "#6d4c41",
      backgroundImage:
        "repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255,255,255,0.15) 4px, rgba(255,255,255,0.15) 5px)",
    };
  }
  if (n.includes("aterro")) {
    return {
      backgroundColor: "#7e57c2",
      backgroundImage:
        "linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.25) 1px, transparent 1px)",
      backgroundSize: "6px 6px",
    };
  }
  if (n.includes("rocha") || n.includes("matacão") || n.includes("matacao")) {
    return {
      backgroundColor: "#374151",
      backgroundImage:
        "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.24) 4px, rgba(255,255,255,0.24) 5px)",
    };
  }
  if (n.includes("residual") || n.includes("saprolito") || n.includes("colúvio") || n.includes("aluvio")) {
    return {
      backgroundColor: "#a1887f",
      backgroundImage:
        "linear-gradient(90deg, rgba(0,0,0,0.15) 1px, transparent 1px), linear-gradient(0deg, rgba(0,0,0,0.15) 1px, transparent 1px)",
      backgroundSize: "6px 6px",
    };
  }
  return { backgroundColor: fallbackColor };
}

