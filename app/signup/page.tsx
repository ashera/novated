import AuthForm from "@/components/AuthForm";
import { signup } from "@/app/actions/auth";
import { googleConfigured } from "@/lib/googleAuth";

export const metadata = {
  title: "Create your free account",
  description: "Save, compare and share your novated lease scenarios. Free — general information only, not financial or tax advice.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthForm mode="signup" action={signup} googleEnabled={googleConfigured()} oauthError={error ?? null} />
  );
}
