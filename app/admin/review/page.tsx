import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { buildReviewData } from "@/lib/refdata";
import ReviewDigest from "@/components/ReviewDigest";

export const metadata = { title: "Backoffice — Review" };

export default async function ReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const data = await buildReviewData();
  return <ReviewDigest email={user.email} data={data} />;
}
