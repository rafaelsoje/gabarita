"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(payload.message ?? "Falha ao autenticar.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <section className="loginCard">
        <aside className="leftPanel">
          <Image className="authBrandLogo" src="/brand/logo-gabarita.svg" alt="Gabarita" width={320} height={90} priority />
          <p className="authBrandTag">Planeje. Estude. Gabarite.</p>
        </aside>
        <div className="rightPanel">
          <h1 className="title">Acesse sua conta</h1>
          <p className="subtitle">Entre para acompanhar seus estudos.</p>

          <form className="form" onSubmit={handleSubmit}>
            <input
              className="input"
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <input
              className="input"
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              minLength={1}
            />
            {error ? <div className="error">{error}</div> : null}
            <div className="row">
              <button className="button" type="submit" disabled={loading}>
                {loading ? "Entrando..." : "Acessar"}
              </button>
            </div>
          </form>

          <div className="links">
            <div>
              <a href="/esqueci-senha">Esqueci a senha</a>
            </div>
            <div>
              Novo por aqui? <a href="/cadastro">Assine agora</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
