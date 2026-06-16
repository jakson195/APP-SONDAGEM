import { createRoot } from "react-dom/client";

import App from "./App";

import LeilaoApp from "./LeilaoApp";

import { isLeilaoANMModule } from "./lib/leilao-module";

import "./index.css";

import "mapbox-gl/dist/mapbox-gl.css";

import "maplibre-gl/dist/maplibre-gl.css";



const Root = isLeilaoANMModule() ? LeilaoApp : App;



createRoot(document.getElementById("root")!).render(<Root />);
