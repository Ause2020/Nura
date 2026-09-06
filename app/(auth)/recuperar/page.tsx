import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthSplitLayout
      title="Recuperar contraseña"
      subtitle="Te enviaremos un enlace al email de tu cuenta Nura."
    >
      <ForgotPasswordForm />
    </AuthSplitLayout>
  );
}
