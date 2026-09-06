import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  return (
    <AuthSplitLayout
      title="Nueva contraseña"
      subtitle="Elige una contraseña nueva para tu cuenta."
    >
      <ResetPasswordForm />
    </AuthSplitLayout>
  );
}
