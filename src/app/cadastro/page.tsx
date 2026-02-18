"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, phone, birthDate, city, state })
    });

    const payload = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(payload.message ?? "Falha ao cadastrar.");
      return;
    }

    setMessage("Conta criada com sucesso. Faça login.");
    setTimeout(() => router.push("/entrar"), 700);
  }

  return (
    <main className="container">
      <section className="loginCard">
        <aside className="leftPanel">
          <Image className="authBrandLogo" src="/brand/logo-gabarita.svg" alt="Gabarita" width={320} height={90} priority />
          <p className="authBrandTag">Planeje. Estude. Gabarite.</p>
        </aside>
        <div className="rightPanel">
          <h1 className="title">Crie sua conta</h1>
          <p className="subtitle">Comece a organizar sua rotina de estudos.</p>
          <form className="form" onSubmit={handleSubmit}>
            <input
              className="input"
              type="text"
              placeholder="Nome (opcional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="input"
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="input"
              type="password"
              placeholder="Senha (mín. 10, com maiúscula e número)"
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <input
              className="input"
              type="tel"
              placeholder="Telefone (opcional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input
              className="input"
              type="date"
              placeholder="Data de nascimento (opcional)"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
            <input
              className="input"
              type="text"
              placeholder="Cidade (opcional)"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
            <input
              className="input"
              type="text"
              placeholder="Estado (opcional)"
              value={state}
              onChange={(e) => setState(e.target.value)}
            />
            {error ? <div className="error">{error}</div> : null}
            {message ? <div>{message}</div> : null}
            <div className="row">
              <button className="button" type="submit">
                Criar conta
              </button>
            </div>
          </form>
          <div className="links">
            <div>
              Já tem conta? <a href="/entrar">Voltar para login</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
