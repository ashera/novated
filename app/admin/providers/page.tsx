import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";
import { listProviders } from "@/app/actions/providers";
import ProvidersAdmin from "@/components/ProvidersAdmin";

export const metadata = { title: "Providers", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  return <ProvidersAdmin providers={await listProviders()} />;
}
