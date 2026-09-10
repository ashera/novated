import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";
import { listVehicles } from "@/app/actions/vehicles";
import VehiclesAdmin from "@/components/VehiclesAdmin";

export const metadata = { title: "Vehicle artwork", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function VehiclesPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  return <VehiclesAdmin vehicles={await listVehicles()} />;
}
