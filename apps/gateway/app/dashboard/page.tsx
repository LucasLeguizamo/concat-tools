import { redirect } from "next/navigation";
import { getSessionUser } from "../../lib/auth/session";
import { getModuleStatuses } from "../../lib/connection";
import { getT } from "../../lib/i18n";
import { disconnectAction, recheckAction } from "./actions";
import { DashboardView, type DashboardParams } from "./view";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getT()).dashboard.title };
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<DashboardParams> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [statuses, t] = await Promise.all([getModuleStatuses(user.id, () => true), getT()]);
  return <DashboardView email={user.email} statuses={statuses} params={await searchParams} disconnect={disconnectAction} recheck={recheckAction} t={t} />;
}
