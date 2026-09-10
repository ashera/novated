import AuthForm from "@/components/AuthForm";
import { login } from "@/app/actions/auth";
import { googleConfigured } from "@/lib/googleAuth";

export const metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthForm mode="login" action={login} googleEnabled={googleConfigured()} oauthError={error ?? null} />
  );
}
