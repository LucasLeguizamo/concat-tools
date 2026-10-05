import { redirect } from "next/navigation";
import { getSessionUser } from "../../lib/auth/session";
import { getModuleStatuses } from "../../lib/connection";
import { t } from "../../lib/copy";
import { disconnectAction, recheckAction } from "./actions";
import { DashboardView, type DashboardParams } from "./view";

export const dynamic = "force-dynamic";
export const metadata = { title: t.dashboard.title };

export default async function Dashboard({ searchParams }: { searchParams: Promise<DashboardParams> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const statuses = await getModuleStatuses(user.id, () => true);
  return <DashboardView email={user.email} statuses={statuses} params={await searchParams} disconnect={disconnectAction} recheck={recheckAction} />;
}
