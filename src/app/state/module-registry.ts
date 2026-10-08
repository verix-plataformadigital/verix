import type { VerixModule } from "../state/app-state";

export interface ModuleDefinition {
  readonly id: VerixModule;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
}

export const MODULES: readonly ModuleDefinition[] = [
  { id: "vehicle", label: "Consulta", description: "Consulta integrada de veículo, IMT e seguro.", icon: "⌕" },
  { id: "history", label: "Histórico", description: "Consultas e operações recentes deste dispositivo.", icon: "↺" },
  { id: "cinemometer", label: "Cinemómetro", description: "Cálculo, enquadramento e texto operacional.", icon: "◉" },
  { id: "legislation", label: "Legislação", description: "Pesquisa rápida e favoritos.", icon: "§" },
  { id: "alcohol", label: "Álcool", description: "Tabela e consulta operacional.", icon: "◌" },
  { id: "settings", label: "Definições", description: "Preferências e diagnóstico.", icon: "⚙" },
  { id: "tools", label: "Ferramentas", description: "Serviços externos e referências operacionais.", icon: "▦" },
  { id: "information", label: "Informações", description: "Informação do sistema e condições de utilização.", icon: "i" }
];

export function moduleById(id: VerixModule): ModuleDefinition | undefined {
  return MODULES.find((module) => module.id === id);
}
