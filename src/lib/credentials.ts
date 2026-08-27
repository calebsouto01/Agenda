/** Domínio interno usado quando o usuário entra apenas com um nome (ex.: "Admin"). */
const USERNAME_DOMAIN = "agenda.local";

/** Converte "Admin" em "admin@agenda.local"; e-mails são apenas normalizados. */
export function resolveEmail(identifier: string): string {
  const value = identifier.trim().toLowerCase();
  if (value.includes("@")) return value;
  return `${value.replace(/[^a-z0-9._-]/g, "")}@${USERNAME_DOMAIN}`;
}

/**
 * O serviço de autenticação exige senha com no mínimo 6 caracteres.
 * Senhas curtas (ex.: "Admin") recebem um sufixo fixo determinístico,
 * de forma transparente para quem digita.
 */
export function resolvePassword(password: string): string {
  return password.length >= 6 ? password : `${password}#${USERNAME_DOMAIN.split(".")[0]}`;
}
