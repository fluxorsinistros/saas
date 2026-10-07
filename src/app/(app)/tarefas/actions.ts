"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getMemberGroups } from "@/lib/active-group";
import { loadTaskCount } from "@/lib/task-count";

// Balão de pendências do menu: o menu pede o número de novo a cada mudança de tela e de minuto em minuto.
export async function getTaskCount(): Promise<number> {
  try {
    const ctx = await getTenantContext();
    const supabase = await createClient();
    const { isAdmin, active } = await getMemberGroups(ctx.userId, ctx.tenantId);
    return await loadTaskCount(supabase, ctx.tenantId, ctx.userId, isAdmin, active?.id ?? null);
  } catch {
    return 0;
  }
}
