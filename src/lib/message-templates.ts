export const DEFAULT_MESSAGE_1 =
  "Oi {nome}! Recebemos seu agendamento na {estabelecimento} pra {data} às {hora}. Qualquer dúvida é só chamar por aqui!";

export const DEFAULT_MESSAGE_CONFIRMACAO =
  "Oi {nome}! Passando pra confirmar seu horário hoje às {hora} na {estabelecimento}. Te esperamos!";

export const MESSAGE_PLACEHOLDERS = ["{nome}", "{data}", "{hora}", "{estabelecimento}"] as const;

export function fillTemplate(
  template: string,
  values: { nome: string; data: string; hora: string; estabelecimento: string },
) {
  return template
    .replaceAll("{nome}", values.nome)
    .replaceAll("{data}", values.data)
    .replaceAll("{hora}", values.hora)
    .replaceAll("{estabelecimento}", values.estabelecimento);
}
