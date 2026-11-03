// Finds Autodarts clients on the local network. They announce themselves via mDNS
// ("_autodarts-board._tcp"); the app listens for them on the Rust side.
import { invoke } from "@tauri-apps/api/core";

export interface FoundBoard {
  id: string;
  name: string; // host name of the machine running the client
  host: string;
  port: number;
  cams: number | null;
}

export function discoverBoards(timeoutMs = 3000): Promise<FoundBoard[]> {
  return invoke<FoundBoard[]>("discover_boards", { timeoutMs });
}
