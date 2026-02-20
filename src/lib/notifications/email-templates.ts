type DigestItem = {
  title: string;
  description: string;
  count: number;
  href: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function absoluteUrl(baseUrl: string, href: string) {
  if (!href) return baseUrl;
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  return `${baseUrl.replace(/\/+$/, "")}/${href.replace(/^\/+/, "")}`;
}

function renderShell(params: {
  title: string;
  eyebrow: string;
  intro: string;
  ctaLabel?: string;
  ctaUrl?: string;
  bodyHtml?: string;
  footerNote?: string;
}) {
  const ctaHtml =
    params.ctaLabel && params.ctaUrl
      ? `<p style="margin:24px 0 0 0"><a href="${escapeHtml(params.ctaUrl)}" style="display:inline-block;background:#1ec5b3;color:#053b37;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">${escapeHtml(params.ctaLabel)}</a></p>`
      : "";
  const footer = params.footerNote ?? "Você recebeu este e-mail porque possui uma conta no Gabarita.";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(params.title)}</title>
  </head>
  <body style="margin:0;background:#f3f7f7;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#17333a">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d9ecea">
            <tr>
              <td style="padding:24px 28px;background:linear-gradient(140deg,#22c6b5,#1aa7d6);color:#ffffff">
                <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.92">${escapeHtml(params.eyebrow)}</div>
                <h1 style="margin:10px 0 0 0;font-size:26px;line-height:1.2">${escapeHtml(params.title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 10px 28px;font-size:16px;line-height:1.55">
                <p style="margin:0">${escapeHtml(params.intro)}</p>
                ${ctaHtml}
                ${params.bodyHtml ?? ""}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 24px 28px;font-size:12px;color:#54767a;border-top:1px solid #e6f1f0">
                ${escapeHtml(footer)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildTestEmailHtml(firstName: string) {
  return renderShell({
    eyebrow: "Gabarita",
    title: "Teste de notificação",
    intro: `Olá, ${firstName}! Este é um teste de notificação do Gabarita.`,
    footerNote: "Se você recebeu este teste, sua integração de e-mail está funcionando."
  });
}

export function buildPasswordResetEmailHtml(params: {
  firstName: string;
  resetUrl: string;
  expiresInMinutes: number;
}) {
  return renderShell({
    eyebrow: "Segurança da conta",
    title: "Redefina sua senha",
    intro: `Olá, ${params.firstName}. Recebemos uma solicitação para redefinir sua senha.`,
    ctaLabel: "Criar nova senha",
    ctaUrl: params.resetUrl,
    bodyHtml: `<p style="margin:18px 0 0 0;color:#31595f">Este link expira em <strong>${params.expiresInMinutes} minutos</strong>. Se você não solicitou, pode ignorar este e-mail.</p>`,
    footerNote: "Nunca compartilhe este link. A equipe do Gabarita não solicita senha por e-mail."
  });
}

export function buildDailyDigestEmailHtml(params: {
  firstName: string;
  appUrl: string;
  dateLabel: string;
  summaryLine: string;
  planScopeLabel: string;
  items: DigestItem[];
}) {
  const itemsHtml = params.items
    .map((item) => {
      const href = absoluteUrl(params.appUrl, item.href);
      return `<tr>
  <td style="padding:14px 0;border-bottom:1px solid #e6f1f0">
    <div style="font-size:16px;font-weight:700;color:#17333a">${escapeHtml(item.title)}</div>
    <div style="margin-top:4px;color:#3d6368">${escapeHtml(item.description)}</div>
    <div style="margin-top:8px"><a href="${escapeHtml(href)}" style="color:#148f84;text-decoration:none;font-weight:600">Abrir no Gabarita</a></div>
  </td>
</tr>`;
    })
    .join("");

  return renderShell({
    eyebrow: "Resumo diário",
    title: `Plano de hoje • ${params.dateLabel}`,
    intro: `Olá, ${params.firstName}! ${params.summaryLine}`,
    ctaLabel: "Abrir meu painel",
    ctaUrl: absoluteUrl(params.appUrl, "/"),
    bodyHtml: `<p style="margin:18px 0 8px 0;color:#31595f"><strong>Escopo:</strong> ${escapeHtml(params.planScopeLabel)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${itemsHtml}</table>`,
    footerNote: "Dica: mantenha suas notificações ativas para não perder prazos e revisões."
  });
}
