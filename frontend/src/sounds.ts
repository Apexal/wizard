export interface SoundDef {
  id: string;
  label: string;
  file: string;
}

export const SOUNDS: SoundDef[] = [
  { id: "thunder", label: "Long MGM Thunder", file: "/sounds/MGM_THUNDER.mp3" },
  {
    id: "thunder-clap",
    label: "Short Thunder Clap",
    file: "/sounds/THUNDER_CLAP.mp3",
  },
];
