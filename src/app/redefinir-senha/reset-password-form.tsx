"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    });
    const payload = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(payload.message ?? "Falha ao redefinir senha.");
      return;
    }
    setMessage(payload.message ?? "Senha redefinida com sucesso.");
  }

  return (
    <main className="container">
      <section className="loginCard">
        <aside className="leftPanel">
          <Image className="authBrandLogo" src="/brand/logo-gabarita.svg" alt="Gabarita" width={320} height={90} priority />
          <p className="authBrandTag">Planeje. Estude. Gabarite.</p>
        </aside>
        <div className="rightPanel">
          <h1 className="title">Nova senha</h1>
          <p className="subtitle">Defina uma nova senha para sua conta.</p>
          <form className="form" onSubmit={handleSubmit}>
            <input
              className="input"
              type="password"
              placeholder="Nova senha (mín. 10, com maiúscula e número)"
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error ? <div className="error">{error}</div> : null}
            {message ? <div>{message}</div> : null}
            <div className="row">
              <button className="button" type="submit">
                Salvar
              </button>
            </div>
          </form>
          <div className="links">
            <div>
              Ir para <a href="/entrar">login</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
