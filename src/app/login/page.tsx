import { Suspense } from "react";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Header } from "@/components/Header";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <PhoneFrame>
      <Header subtitle="sign in to keep training" />
      <Suspense fallback={<div className="card d1">loading…</div>}>
        <LoginForm />
      </Suspense>
      <div className="card alt d2">
        <div className="text-[13.5px] text-[color:var(--muted)]">
          Fitnerds! is private — only allow-listed emails (rayner + ada) can sign in.
          everyone else lands on a polite goodbye page.
        </div>
      </div>
    </PhoneFrame>
  );
}
