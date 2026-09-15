// Áudio e foto do cliente (14/09): o parser tem que achar o id da mídia no payload da
// Meta, e a camada de entendimento tem que devolver TEXTO — ou null, que é o que faz a
// Lia pedir por texto em vez de chutar produto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { whatsappAdapter } from "../src/lib/adapters/whatsapp";
import { derivedMessageLabel, understandMedia, type MediaDeps } from "../src/lib/media-understanding";

const bytes = new Uint8Array([1, 2, 3]);

function deps(over: Partial<MediaDeps> = {}): MediaDeps {
  return {
    download: async () => ({ bytes, mimeType: "audio/ogg; codecs=opus" }),
    transcribe: async () => null,
    describe: async () => null,
    ...over
  };
}

test("Meta: áudio de voz chega como id de mídia, sem texto", () => {
  const inbound = whatsappAdapter.parseInbound({
    entry: [{ changes: [{ value: { messages: [{
      from: "5511999999999",
      id: "wamid.audio",
      type: "audio",
      audio: { id: "media-123", mime_type: "audio/ogg; codecs=opus", voice: true }
    }] } }] }]
  });
  assert.equal(inbound.text, "");
  assert.deepEqual(inbound.media, { kind: "audio", id: "media-123", mimeType: "audio/ogg; codecs=opus" });
});

test("Meta: foto chega com id e legenda", () => {
  const inbound = whatsappAdapter.parseInbound({
    entry: [{ changes: [{ value: { messages: [{
      from: "5511999999999",
      id: "wamid.image",
      type: "image",
      image: { id: "media-777", mime_type: "image/jpeg", caption: "quero 2 desse" }
    }] } }] }]
  });
  // A legenda NÃO vira texto: sozinha ela não é pedido — quem completa a frase é a foto.
  assert.equal(inbound.text, "");
  assert.deepEqual(inbound.media, { kind: "image", id: "media-777", mimeType: "image/jpeg", caption: "quero 2 desse" });
});

test("áudio vira a frase transcrita", async () => {
  const seen: string[] = [];
  const result = await understandMedia(
    { kind: "audio", id: "m1", mimeType: "audio/ogg" },
    deps({
      transcribe: async (b, mime) => {
        seen.push(mime);
        assert.equal(b, bytes);
        return "  me manda 2 arroz e   um feijão  ";
      }
    })
  );
  assert.deepEqual(result, { kind: "audio", text: "me manda 2 arroz e um feijão" });
  assert.equal(seen[0], "audio/ogg");
});

test("áudio sem fala (transcrição vazia ou só pontuação) não vira pedido", async () => {
  for (const heard of [null, "", "   ", "..."]) {
    const result = await understandMedia({ kind: "audio", id: "m1" }, deps({ transcribe: async () => heard }));
    assert.equal(result, null, `transcrição ${JSON.stringify(heard)} não podia virar pedido`);
  }
});

test("foto vira o pedido que a IA leu na etiqueta", async () => {
  const result = await understandMedia(
    { kind: "image", id: "m2", mimeType: "image/jpeg", caption: "acabou esse" },
    deps({
      describe: async (_b, _mime, caption) => {
        assert.equal(caption, "acabou esse");
        return "shampoo Pantene Restauração 400ml";
      }
    })
  );
  assert.deepEqual(result, { kind: "image", text: "shampoo Pantene Restauração 400ml" });
});

test("foto sem produto (selfie/meme) cai pra legenda quando ela já é um pedido", async () => {
  const withOrder = await understandMedia(
    { kind: "image", id: "m3", caption: "me ve 2 sabão em pó" },
    deps({ describe: async () => null })
  );
  assert.deepEqual(withOrder, { kind: "image", text: "me ve 2 sabão em pó" });

  const withoutCaption = await understandMedia({ kind: "image", id: "m3" }, deps({ describe: async () => null }));
  assert.equal(withoutCaption, null);
});

test("download que falha não chama IA nenhuma e devolve null", async () => {
  let called = false;
  const result = await understandMedia(
    { kind: "audio", id: "m4" },
    deps({
      download: async () => null,
      transcribe: async () => {
        called = true;
        return "nunca";
      }
    })
  );
  assert.equal(result, null);
  assert.equal(called, false);
});

test("erro de rede na transcrição não derruba o turno", async () => {
  const result = await understandMedia(
    { kind: "audio", id: "m5" },
    deps({
      transcribe: async () => {
        throw new Error("openai down");
      }
    })
  );
  assert.equal(result, null);
});

test("kill-switch por tipo: LIA_MEDIA_AUDIO=false não baixa nada", async () => {
  const previous = process.env.LIA_MEDIA_AUDIO;
  process.env.LIA_MEDIA_AUDIO = "false";
  try {
    let downloaded = false;
    const result = await understandMedia(
      { kind: "audio", id: "m6" },
      deps({
        download: async () => {
          downloaded = true;
          return { bytes, mimeType: "audio/ogg" };
        }
      })
    );
    assert.equal(result, null);
    assert.equal(downloaded, false);
    // Foto continua ligada: as flags são independentes.
    const photo = await understandMedia({ kind: "image", id: "m7" }, deps({ describe: async () => "arroz 5kg" }));
    assert.deepEqual(photo, { kind: "image", text: "arroz 5kg" });
  } finally {
    if (previous === undefined) delete process.env.LIA_MEDIA_AUDIO;
    else process.env.LIA_MEDIA_AUDIO = previous;
  }
});

test("a conversa gravada diz de onde veio o texto", () => {
  assert.equal(derivedMessageLabel("audio", "2 arroz"), "[áudio] 2 arroz");
  assert.equal(derivedMessageLabel("image", "arroz 5kg"), "[foto] arroz 5kg");
});

// ---- o fio com a Meta e com a OpenAI (formato da chamada, que é o que quebra em prod) ----

test("downloadMedia: dois passos na Graph, Bearer nos dois", async () => {
  const previous = { token: process.env.WHATSAPP_ACCESS_TOKEN, fetch: global.fetch };
  process.env.WHATSAPP_ACCESS_TOKEN = "tok-meta";
  const calls: Array<{ url: string; auth?: string }> = [];
  global.fetch = (async (url: any, init: any) => {
    const href = String(url);
    calls.push({ url: href, auth: init?.headers?.Authorization });
    if (href.includes("graph.facebook.com")) {
      return new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/x?token=abc", mime_type: "audio/ogg", file_size: 3 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(new Uint8Array([7, 8, 9]), { status: 200, headers: { "Content-Type": "audio/ogg" } });
  }) as any;
  try {
    const file = await whatsappAdapter.downloadMedia("media-123");
    assert.deepEqual(Array.from(file!.bytes), [7, 8, 9]);
    assert.equal(file!.mimeType, "audio/ogg");
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/media-123$/);
    // A URL assinada sozinha devolve 401: o Bearer é obrigatório nas DUAS chamadas.
    assert.equal(calls[0].auth, "Bearer tok-meta");
    assert.equal(calls[1].auth, "Bearer tok-meta");
  } finally {
    global.fetch = previous.fetch;
    if (previous.token === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = previous.token;
  }
});

test("downloadMedia: arquivo acima do teto não é baixado", async () => {
  const previous = { token: process.env.WHATSAPP_ACCESS_TOKEN, max: process.env.LIA_MEDIA_MAX_BYTES, fetch: global.fetch };
  process.env.WHATSAPP_ACCESS_TOKEN = "tok-meta";
  process.env.LIA_MEDIA_MAX_BYTES = "100";
  let downloads = 0;
  global.fetch = (async (url: any) => {
    if (String(url).includes("graph.facebook.com")) {
      return new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/x", mime_type: "audio/ogg", file_size: 5_000 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    downloads += 1;
    return new Response(new Uint8Array(5_000), { status: 200 });
  }) as any;
  try {
    assert.equal(await whatsappAdapter.downloadMedia("big"), null);
    assert.equal(downloads, 0);
  } finally {
    global.fetch = previous.fetch;
    if (previous.token === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = previous.token;
    if (previous.max === undefined) delete process.env.LIA_MEDIA_MAX_BYTES;
    else process.env.LIA_MEDIA_MAX_BYTES = previous.max;
  }
});

test("downloadMedia: sem token não chama a Graph", async () => {
  const previous = { token: process.env.WHATSAPP_ACCESS_TOKEN, fetch: global.fetch };
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  let called = false;
  global.fetch = (async () => {
    called = true;
    return new Response("{}", { status: 200 });
  }) as any;
  try {
    assert.equal(await whatsappAdapter.downloadMedia("m"), null);
    assert.equal(called, false);
  } finally {
    global.fetch = previous.fetch;
    if (previous.token !== undefined) process.env.WHATSAPP_ACCESS_TOKEN = previous.token;
  }
});

test("transcrição: OGG do WhatsApp vai com extensão .ogg (a API escolhe o decoder por ela)", async () => {
  const { transcribeCustomerAudio } = await import("../src/lib/adapters/ai");
  const previous = { key: process.env.OPENAI_API_KEY, fetch: global.fetch };
  process.env.OPENAI_API_KEY = "sk-test";
  let sent: FormData | undefined;
  global.fetch = (async (url: any, init: any) => {
    assert.match(String(url), /\/v1\/audio\/transcriptions$/);
    sent = init.body as FormData;
    return new Response(JSON.stringify({ text: "duas caixas de leite" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as any;
  try {
    const heard = await transcribeCustomerAudio(new Uint8Array([1, 2]), "audio/ogg; codecs=opus");
    assert.equal(heard, "duas caixas de leite");
    assert.equal((sent!.get("file") as File).name, "audio.ogg");
    assert.equal(sent!.get("language"), "pt");
  } finally {
    global.fetch = previous.fetch;
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous.key;
  }
});

test("visão: NAO_PRODUTO vira null (nunca chutar produto a partir de foto ambígua)", async () => {
  const { describeProductImage } = await import("../src/lib/adapters/ai");
  const previous = { key: process.env.OPENAI_API_KEY, fetch: global.fetch };
  process.env.OPENAI_API_KEY = "sk-test";
  let body: any;
  global.fetch = (async (_url: any, init: any) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ output_text: "NAO_PRODUTO" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as any;
  try {
    assert.equal(await describeProductImage(new Uint8Array([1]), "image/jpeg", "olha isso"), null);
    // A foto vai como input_image em data URL, junto da legenda do cliente.
    const parts = body.input[1].content;
    assert.equal(parts[0].type, "input_text");
    assert.match(parts[0].text, /olha isso/);
    assert.equal(parts[1].type, "input_image");
    assert.match(parts[1].image_url, /^data:image\/jpeg;base64,/);
  } finally {
    global.fetch = previous.fetch;
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous.key;
  }
});

test("visão sem OPENAI_API_KEY devolve null sem chamar rede", async () => {
  const { describeProductImage } = await import("../src/lib/adapters/ai");
  const previous = { key: process.env.OPENAI_API_KEY, fetch: global.fetch };
  delete process.env.OPENAI_API_KEY;
  let called = false;
  global.fetch = (async () => {
    called = true;
    return new Response("{}", { status: 200 });
  }) as any;
  try {
    assert.equal(await describeProductImage(new Uint8Array([1]), "image/jpeg"), null);
    assert.equal(called, false);
  } finally {
    global.fetch = previous.fetch;
    if (previous.key !== undefined) process.env.OPENAI_API_KEY = previous.key;
  }
});
