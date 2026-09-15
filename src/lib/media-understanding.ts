// Áudio e foto do cliente → texto para o cérebro (14/09).
//
// O WhatsApp é canal de voz e de foto: ditar o pedido é mais rápido que digitar, e
// fotografar o rótulo do que acabou é mais rápido que lembrar a marca. Até aqui a Lia
// respondia "só consigo ler texto" e o cliente refazia o pedido na mão.
//
// Esta camada NÃO decide nada de produto: ela transforma mídia em uma linha de texto e
// entrega ao MESMO NLU de quem digitou (um caminho só para manter, uma lógica só para
// testar). Nunca lança — falha vira `null` e a Lia pede por texto, como antes.
//
// A mídia da Meta chega como um id; os bytes saem de `whatsappAdapter.downloadMedia`
// (URL assinada de vida curta). As dependências entram por parâmetro para os testes
// rodarem sem rede e sem credencial.
import { whatsappAdapter } from "@/lib/adapters/whatsapp";
import { describeProductImage, transcribeCustomerAudio } from "@/lib/adapters/ai";

export type InboundMedia = {
  kind: "audio" | "image";
  id: string;
  mimeType?: string;
  caption?: string;
};

export type MediaUnderstanding = { text: string; kind: "audio" | "image" };

export type MediaDeps = {
  download: (mediaId: string) => Promise<{ bytes: Uint8Array; mimeType: string } | null>;
  transcribe: (bytes: Uint8Array, mimeType: string) => Promise<string | null>;
  describe: (bytes: Uint8Array, mimeType: string, caption?: string) => Promise<string | null>;
};

const defaultDeps: MediaDeps = {
  download: (mediaId) => whatsappAdapter.downloadMedia(mediaId),
  transcribe: transcribeCustomerAudio,
  describe: describeProductImage
};

// Kill-switch por tipo: áudio e foto têm custo e latência diferentes, então desligam
// separado (`LIA_MEDIA_AUDIO=false` / `LIA_MEDIA_IMAGE=false`). Desligado = a Lia volta a
// avisar que só lê texto, sem gastar chamada nenhuma.
export function mediaKindEnabled(kind: "audio" | "image"): boolean {
  const flag = kind === "audio" ? process.env.LIA_MEDIA_AUDIO : process.env.LIA_MEDIA_IMAGE;
  return flag !== "false";
}

let depsImpl: MediaDeps = defaultDeps;

// Costura de TESTE: os E2E mandam áudio/foto sem rede e sem credencial (mesmo padrão do
// router de IA). Passar `deps` explicitamente continua valendo para o teste unitário.
export function __setMediaDepsForTests(deps: Partial<MediaDeps> | null) {
  depsImpl = deps ? { ...defaultDeps, ...deps } : defaultDeps;
}

export async function understandMedia(
  media: InboundMedia,
  deps: MediaDeps = depsImpl
): Promise<MediaUnderstanding | null> {
  if (!media?.id || !mediaKindEnabled(media.kind)) return null;
  const file = await deps.download(media.id).catch(() => null);
  if (!file || !file.bytes?.length) return null;
  const mimeType = media.mimeType ?? file.mimeType;

  if (media.kind === "audio") {
    const heard = await deps.transcribe(file.bytes, mimeType).catch(() => null);
    const text = cleanDerivedText(heard);
    return text ? { text, kind: "audio" } : null;
  }

  const seen = await deps.describe(file.bytes, mimeType, media.caption).catch(() => null);
  const described = cleanDerivedText(seen);
  if (!described) {
    // Foto que não deu pedido, mas com legenda que já é um pedido ("quero 2 desse" não,
    // mas "me manda 2 sabão em pó" sim): a legenda vale por si — melhor atender pela
    // legenda que jogar a mensagem fora.
    const caption = cleanDerivedText(media.caption);
    return caption ? { text: caption, kind: "image" } : null;
  }
  return { text: described, kind: "image" };
}

// A linha derivada entra no cérebro como se o cliente tivesse digitado, então recebe o
// mesmo saneamento de qualquer entrada: uma linha, sem espaço duplo, com teto. Áudio
// vazio ("...") ou só pontuação não é pedido.
function cleanDerivedText(value: string | null | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!text) return null;
  if (!/[\p{L}\p{N}]/u.test(text)) return null;
  return text;
}

// O que fica gravado na conversa (auditoria do /ops e do banco): a origem precisa ficar
// explícita, senão uma transcrição errada parece coisa que o cliente digitou.
export function derivedMessageLabel(kind: "audio" | "image", text: string): string {
  return `${kind === "audio" ? "[áudio]" : "[foto]"} ${text}`;
}
