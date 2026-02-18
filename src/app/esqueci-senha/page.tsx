"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);

    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const payload = (await response.json()) as { message?: string };
    setMessage(payload.message ?? "Solicitação recebida.");
  }

  return (
    <main className="container">
      <section className="loginCard">
        <aside className="leftPanel">
          <Image className="authBrandLogo" src="/brand/logo-gabarita.svg" alt="Gabarita" width={320} height={90} priority />
          <p className="authBrandTag">Planeje. Estude. Gabarite.</p>
        </aside>
        <div className="rightPanel">
          <h1 className="title">Recuperar senha</h1>
          <p className="subtitle">Informe seu e-mail para receber o link de redefinição.</p>
          <form className="form" onSubmit={handleSubmit}>
            <input
              className="input"
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div className="row">
              <button className="button" type="submit">
                Enviar
              </button>
            </div>
          </form>
          <div className="links">
            <div>
              Lembrou da senha? <a href="/entrar">Voltar para login</a>
            </div>
          </div>
          {message ? <p className="subtitle">{message}</p> : null}
        </div>
      </section>
    </main>
  );
}
