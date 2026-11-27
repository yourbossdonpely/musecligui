// Color language for the file tree: folders are gold, and every file type plus
// every folder purpose gets its own tone, following the conventions VS Code's
// icon themes established (JavaScript yellow, TypeScript blue, Git orange).
// Each tone ships a light/dark pair so icons read on both themes. Tones only
// have to be unique within an icon shape: code files share one glyph, so the
// common languages each get their own hue, while media and folders reuse hues
// freely since their glyphs already differ.

// Full class literals: Tailwind only generates utilities it can read in source,
// so these must never be built with string interpolation.
const TONES = {
  yellow: "text-yellow-600 dark:text-yellow-400",
  blue: "text-blue-600 dark:text-blue-400",
  amber: "text-amber-600 dark:text-amber-400",
  sky: "text-sky-600 dark:text-sky-400",
  orange: "text-orange-600 dark:text-orange-400",
  cyan: "text-cyan-600 dark:text-cyan-400",
  fuchsia: "text-fuchsia-600 dark:text-fuchsia-400",
  green: "text-green-600 dark:text-green-400",
  stone: "text-stone-500 dark:text-stone-400",
  teal: "text-teal-600 dark:text-teal-400",
  red: "text-red-600 dark:text-red-400",
  rose: "text-rose-600 dark:text-rose-400",
  violet: "text-violet-600 dark:text-violet-400",
  indigo: "text-indigo-600 dark:text-indigo-400",
  purple: "text-purple-600 dark:text-purple-400",
  lime: "text-lime-600 dark:text-lime-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  slate: "text-slate-500 dark:text-slate-400",
  pink: "text-pink-600 dark:text-pink-400",
  subtle: "text-subtle",
} as const;

type ToneName = keyof typeof TONES;

const EXT_TONES: Record<string, ToneName> = {
  js: "yellow",
  jsx: "yellow",
  mjs: "yellow",
  cjs: "yellow",
  ts: "blue",
  tsx: "blue",
  mts: "blue",
  cts: "blue",
  json: "amber",
  jsonc: "amber",
  json5: "amber",
  md: "sky",
  markdown: "sky",
  rst: "sky",
  adoc: "sky",
  html: "orange",
  htm: "orange",
  xhtml: "orange",
  css: "cyan",
  scss: "fuchsia",
  sass: "fuchsia",
  less: "fuchsia",
  styl: "fuchsia",
  py: "green",
  pyi: "green",
  rs: "stone",
  go: "teal",
  mod: "teal",
  sum: "teal",
  java: "red",
  gradle: "red",
  rb: "rose",
  erb: "rose",
  php: "violet",
  c: "indigo",
  h: "indigo",
  cpp: "purple",
  hpp: "purple",
  cc: "purple",
  cxx: "purple",
  hh: "purple",
  cs: "lime",
  csx: "lime",
  sh: "emerald",
  bash: "emerald",
  zsh: "emerald",
  fish: "emerald",
  ps1: "emerald",
  psm1: "emerald",
  bat: "emerald",
  cmd: "emerald",
  swift: "orange",
  kt: "violet",
  kts: "violet",
  dart: "cyan",
  lua: "blue",
  r: "sky",
  scala: "red",
  sbt: "red",
  vue: "green",
  svelte: "orange",
  astro: "purple",
  sql: "slate",
  yml: "slate",
  yaml: "slate",
  toml: "slate",
  xml: "slate",
  csv: "slate",
  tsv: "slate",
  ini: "slate",
  cfg: "slate",
  conf: "slate",
  env: "slate",
  lock: "slate",
  png: "pink",
  jpg: "pink",
  jpeg: "pink",
  gif: "pink",
  webp: "pink",
  avif: "pink",
  svg: "pink",
  ico: "pink",
  bmp: "pink",
  mp4: "rose",
  webm: "rose",
  mov: "rose",
  m4v: "rose",
  ogv: "rose",
  mp3: "violet",
  wav: "violet",
  ogg: "violet",
  m4a: "violet",
  flac: "violet",
  pdf: "red",
  ttf: "slate",
  otf: "slate",
  woff: "slate",
  woff2: "slate",
  zip: "slate",
  tar: "slate",
  gz: "slate",
  rar: "slate",
  "7z": "slate",
  exe: "slate",
  dll: "slate",
  so: "slate",
  dylib: "slate",
};

/** Exact file names that beat their extension (or their lack of one). Lowercase. */
const FILE_NAME_TONES: Record<string, ToneName> = {
  dockerfile: "blue",
  "docker-compose.yml": "blue",
  "docker-compose.yaml": "blue",
  makefile: "red",
  gnumakefile: "red",
  cmakelists: "red",
  license: "sky",
  licence: "sky",
  readme: "sky",
  changelog: "sky",
  contributing: "sky",
  ".gitignore": "orange",
  ".gitattributes": "orange",
  ".gitmodules": "orange",
  ".editorconfig": "slate",
};

/** Folder purposes by exact lowercase name. Everything else is gold. */
const FOLDER_TONES: Record<string, ToneName> = {
  ".git": "orange",
  api: "sky",
  apis: "sky",
  rest: "sky",
  graphql: "sky",
  trpc: "sky",
  server: "violet",
  servers: "violet",
  backend: "violet",
  backends: "violet",
  script: "emerald",
  scripts: "emerald",
  config: "slate",
  configs: "slate",
  ".config": "slate",
  conf: "slate",
  settings: "slate",
  ci: "slate",
  workflows: "slate",
  docs: "blue",
  doc: "blue",
  documentation: "blue",
  wiki: "blue",
  test: "green",
  tests: "green",
  testing: "green",
  __tests__: "green",
  spec: "green",
  specs: "green",
  e2e: "green",
  public: "pink",
  static: "pink",
  assets: "pink",
  images: "pink",
  img: "pink",
  media: "pink",
  resources: "pink",
  components: "cyan",
  ui: "cyan",
  views: "cyan",
  pages: "cyan",
  screens: "cyan",
  types: "teal",
  interfaces: "teal",
  models: "teal",
  model: "teal",
  schemas: "teal",
  schema: "teal",
  utils: "indigo",
  helpers: "indigo",
  common: "indigo",
  shared: "indigo",
  core: "indigo",
  lib: "indigo",
  hooks: "fuchsia",
  middleware: "fuchsia",
  plugins: "fuchsia",
  extensions: "fuchsia",
  build: "stone",
  dist: "stone",
  out: "stone",
  target: "stone",
  bin: "stone",
  obj: "stone",
  tmp: "stone",
  temp: "stone",
  cache: "stone",
  logs: "stone",
  log: "stone",
};

const DIMMED_FOLDERS = new Set(["node_modules", "vendor", "venv", ".venv", "__pycache__"]);

/** The tone class for a file's icon: exact name first, then extension, then a code/generic fallback. */
export function fileIconTone(name: string, isCode: boolean): string {
  const lower = name.toLowerCase();
  const exact = FILE_NAME_TONES[lower];
  if (exact) {
    return TONES[exact];
  }
  if (lower.startsWith(".")) {
    // Dotfiles stay quiet unless they are known; a tree full of loud dotfiles scans worse.
    return TONES.subtle;
  }
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot + 1) : "";
  const tone = ext ? EXT_TONES[ext] : undefined;
  if (tone) {
    return TONES[tone];
  }
  return isCode ? TONES.sky : TONES.subtle;
}

/** The tone class for a folder's icon: gold by default, purpose colors by name, dimmed for the ignored. */
export function folderTone(name: string): string {
  const lower = name.toLowerCase();
  const exact = FOLDER_TONES[lower];
  if (exact) {
    return TONES[exact];
  }
  if (DIMMED_FOLDERS.has(lower)) {
    return TONES.subtle;
  }
  if (lower.startsWith(".")) {
    return TONES.subtle;
  }
  return TONES.amber;
}
