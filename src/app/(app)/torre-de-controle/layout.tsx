import { requireScreen } from "@/lib/screens";

// Tela escondida pelo grupo da pessoa não abre nem por endereço direto.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireScreen("torre-de-controle");
  return children;
}
