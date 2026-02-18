import { NextResponse } from "next/server";

export function unauthorized() {
  return NextResponse.json({ message: "Não autenticado." }, { status: 401 });
}

export function badRequest(message = "Dados inválidos.") {
  return NextResponse.json({ message }, { status: 400 });
}

export function notFound(message = "Registro não encontrado.") {
  return NextResponse.json({ message }, { status: 404 });
}

export function serverError() {
  return NextResponse.json({ message: "Erro interno." }, { status: 500 });
}
