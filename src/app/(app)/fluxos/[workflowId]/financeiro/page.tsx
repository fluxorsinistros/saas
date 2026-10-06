import { redirect } from "next/navigation";

// O painel financeiro mudou para /sinistros/painel-financeiro (não depende da tela Fluxos).
export default async function Page({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params;
  redirect(`/sinistros/painel-financeiro/${workflowId}`);
}
