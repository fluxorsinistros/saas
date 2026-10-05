import {
  Anchor,
  Banknote,
  Briefcase,
  Building2,
  Calculator,
  Camera,
  ClipboardCheck,
  Clock,
  FileSearch,
  FileText,
  Gavel,
  Handshake,
  Headset,
  HeartPulse,
  Landmark,
  LifeBuoy,
  Package,
  Phone,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Truck,
  UserCheck,
  Users,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";

// Ícone e cor de cada grupo: escolhidos de um catálogo fechado (nada de arquivo enviado). Assim o visual fica consistente
// em todas as telas, não há risco de segurança com imagem/SVG e a cor já vem com contraste bom.
export const GROUP_ICONS: Record<string, { label: string; Icon: LucideIcon }> = {
  users: { label: "Equipe", Icon: Users },
  truck: { label: "Transporte", Icon: Truck },
  package: { label: "Carga", Icon: Package },
  warehouse: { label: "Armazém", Icon: Warehouse },
  anchor: { label: "Porto", Icon: Anchor },
  "shield-check": { label: "Seguros", Icon: ShieldCheck },
  "shield-alert": { label: "Gestão de risco", Icon: ShieldAlert },
  siren: { label: "Ocorrência", Icon: Siren },
  scale: { label: "Jurídico", Icon: Scale },
  gavel: { label: "Contencioso", Icon: Gavel },
  banknote: { label: "Financeiro", Icon: Banknote },
  calculator: { label: "Contabilidade", Icon: Calculator },
  landmark: { label: "Banco", Icon: Landmark },
  "clipboard-check": { label: "Conferência", Icon: ClipboardCheck },
  "file-search": { label: "Análise", Icon: FileSearch },
  "file-text": { label: "Documentos", Icon: FileText },
  search: { label: "Investigação", Icon: Search },
  camera: { label: "Vistoria", Icon: Camera },
  wrench: { label: "Operacional", Icon: Wrench },
  briefcase: { label: "Comercial", Icon: Briefcase },
  handshake: { label: "Acordos", Icon: Handshake },
  headset: { label: "Atendimento", Icon: Headset },
  phone: { label: "Contato", Icon: Phone },
  "user-check": { label: "Aprovação", Icon: UserCheck },
  building: { label: "Regulação", Icon: Building2 },
  clock: { label: "Prazos", Icon: Clock },
  "heart-pulse": { label: "Saúde", Icon: HeartPulse },
  "life-buoy": { label: "Suporte", Icon: LifeBuoy },
};

// Classes completas escritas por extenso (o Tailwind só gera o que enxerga no código).
export const GROUP_COLORS: Record<string, { label: string; chip: string; swatch: string }> = {
  slate: { label: "Cinza", chip: "bg-slate-100 text-slate-700", swatch: "bg-slate-500" },
  blue: { label: "Azul", chip: "bg-blue-100 text-blue-800", swatch: "bg-blue-600" },
  sky: { label: "Céu", chip: "bg-sky-100 text-sky-800", swatch: "bg-sky-600" },
  teal: { label: "Verde-água", chip: "bg-teal-100 text-teal-800", swatch: "bg-teal-600" },
  emerald: { label: "Verde", chip: "bg-emerald-100 text-emerald-800", swatch: "bg-emerald-600" },
  amber: { label: "Âmbar", chip: "bg-amber-100 text-amber-800", swatch: "bg-amber-500" },
  orange: { label: "Laranja", chip: "bg-orange-100 text-orange-800", swatch: "bg-orange-500" },
  rose: { label: "Vermelho", chip: "bg-rose-100 text-rose-800", swatch: "bg-rose-600" },
  violet: { label: "Violeta", chip: "bg-violet-100 text-violet-800", swatch: "bg-violet-600" },
  pink: { label: "Rosa", chip: "bg-pink-100 text-pink-800", swatch: "bg-pink-600" },
};

export const DEFAULT_GROUP_ICON = "users";
export const DEFAULT_GROUP_COLOR = "slate";

export function normalizeGroupIcon(v: unknown): string {
  return typeof v === "string" && v in GROUP_ICONS ? v : DEFAULT_GROUP_ICON;
}
export function normalizeGroupColor(v: unknown): string {
  return typeof v === "string" && v in GROUP_COLORS ? v : DEFAULT_GROUP_COLOR;
}

// Quadradinho colorido com o ícone do grupo.
export function GroupIcon({ icon, color, className = "size-6", iconClassName = "size-3.5" }: { icon?: string | null; color?: string | null; className?: string; iconClassName?: string }) {
  const { Icon } = GROUP_ICONS[normalizeGroupIcon(icon)];
  const { chip } = GROUP_COLORS[normalizeGroupColor(color)];
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-md ${chip} ${className}`} aria-hidden="true">
      <Icon className={iconClassName} />
    </span>
  );
}

// Ícone + nome, para listas e rótulos.
export function GroupChip({ name, icon, color }: { name: string; icon?: string | null; color?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <GroupIcon icon={icon} color={color} className="size-5" iconClassName="size-3" />
      <span>{name}</span>
    </span>
  );
}
