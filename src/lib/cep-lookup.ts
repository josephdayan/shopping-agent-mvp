// Localidade oficial de um CEP (ViaCEP), sem lançar. Usada para completar o endereço que o
// cliente digitou ("Rua X 221 ap 13") com bairro/cidade/UF antes de entregar ao comprador —
// o comprador exige cada campo literalmente no texto (a IA não completa dados pessoais), e o
// cliente quase nunca digita cidade e UF. Só localidade do CEP: nada de rua/número inventados.
export type CepLocality = { neighborhood?: string; city?: string; uf?: string };

export async function lookupCepLocality(cep: string, timeoutMs = 4_000): Promise<CepLocality | null> {
  const digits = (cep ?? "").replace(/\D/g, "");
  if (digits.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const data = (await res.json()) as { bairro?: string; localidade?: string; uf?: string; erro?: boolean };
    if (data.erro) return null;
    return { neighborhood: data.bairro || undefined, city: data.localidade || undefined, uf: data.uf || undefined };
  } catch {
    return null;
  }
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Acrescenta ao texto do cliente só o que falta (bairro, cidade, UF, CEP), preservando o que
// ele escreveu. Puro e testado.
export function completeAddressWithLocality(address: string, cep: string | null | undefined, locality: CepLocality | null): string {
  const base = address.trim().replace(/[,\s]+$/, "");
  const have = fold(base);
  const parts: string[] = [];
  for (const piece of [locality?.neighborhood, locality?.city]) {
    if (piece && !have.includes(fold(piece))) parts.push(piece);
  }
  if (locality?.uf && !new RegExp(`\\b${locality.uf.toLowerCase()}\\b`).test(have)) parts.push(locality.uf);
  const digits = (cep ?? "").replace(/\D/g, "");
  const cepText = digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : "";
  if (cepText && !have.replace(/\D/g, "").includes(digits)) parts.push(`CEP ${cepText}`);
  return parts.length ? `${base}, ${parts.join(", ")}` : base;
}
