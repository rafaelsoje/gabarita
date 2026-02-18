import { Suspense } from "react";
import { ResetPasswordForm } from "@/app/redefinir-senha/reset-password-form";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
