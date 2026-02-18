import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { registerSchema } from "@/lib/auth/schemas";
import { isTrustedAuthRequest } from "@/lib/auth/csrf";
import { checkRateLimit, getClientIp } from "@/lib/auth/rate-limit";
import { assertEnv } from "@/lib/env";

export async function POST(request: Request) {
  try {
    assertEnv();
    if (!isTrustedAuthRequest(request)) {
      return NextResponse.json({ message: "Origem inválida." }, { status: 403 });
    }

    const ip = getClientIp(request);
    const ipRate = await checkRateLimit(`register:ip:${ip}`, 10, 60_000, { failClosed: true });
    if (!ipRate.allowed) {
      return NextResponse.json({ message: "Muitas tentativas. Tente novamente em 1 minuto." }, { status: 429 });
    }

    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: "Dados inválidos." }, { status: 400 });
    }

    const { name, email, password, phone, birthDate, city, state } = parsed.data;
    const emailRate = await checkRateLimit(`register:email:${email}:${ip}`, 5, 60_000, { failClosed: true });
    if (!emailRate.allowed) {
      return NextResponse.json({ message: "Muitas tentativas. Tente novamente em 1 minuto." }, { status: 429 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ message: "Cadastro recebido. Se o e-mail estiver disponível, sua conta será criada." }, { status: 201 });
    }

    const passwordHash = await hashPassword(password);
    try {
      await prisma.user.create({
        data: {
          name,
          email,
          phone,
          birthDate,
          city,
          state,
          passwordHash
        }
      });
    } catch {
      // Fallback for databases not yet migrated with optional profile fields.
      await prisma.user.create({
        data: {
          name,
          email,
          passwordHash
        }
      });
    }

    return NextResponse.json({ message: "Cadastro recebido. Se o e-mail estiver disponível, sua conta será criada." }, { status: 201 });
  } catch {
    return NextResponse.json({ message: "Erro interno." }, { status: 500 });
  }
}
