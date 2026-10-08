import "./styles.css";
import { bootstrap } from "../src/app/bootstrap";

const root = document.getElementById("app-root");

if (!(root instanceof HTMLElement)) {
  throw new Error("VÉRIX: elemento raiz #app-root não encontrado.");
}

void bootstrap(root);
