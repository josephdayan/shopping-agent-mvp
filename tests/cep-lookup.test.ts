// 15/09: primeiro pedido real da Cobasi — o endereço do cliente era só "Rua … 221 ap 13" e o
// comprador exige bairro/cidade/UF literais no texto. O servidor completa com a localidade
// oficial do CEP, sem inventar rua/número e sem duplicar o que o cliente já escreveu.
import { test } from "node:test";
import assert from "node:assert/strict";
import { completeAddressWithLocality } from "../src/lib/cep-lookup";

test("completa bairro, cidade, UF e CEP quando faltam; não repete o que já está no texto", () => {
  const loc = { neighborhood: "Santa Cecília", city: "São Paulo", uf: "SP" };
  assert.equal(
    completeAddressWithLocality("Rua Engenheiro Edgar Egidio de Souza 221 ap 13", "01233-020", loc),
    "Rua Engenheiro Edgar Egidio de Souza 221 ap 13, Santa Cecília, São Paulo, SP, CEP 01233-020",
  );
  assert.equal(
    completeAddressWithLocality("Rua das Flores, 123, Bela Vista, São Paulo - SP, CEP 01310-100", "01310100", { neighborhood: "Bela Vista", city: "São Paulo", uf: "SP" }),
    "Rua das Flores, 123, Bela Vista, São Paulo - SP, CEP 01310-100",
  );
  // Acentos e caixa não geram duplicata; "sp" solto dentro de palavra não conta como UF.
  assert.equal(
    completeAddressWithLocality("rua x 10, santa cecilia, sao paulo", "01233020", loc),
    "rua x 10, santa cecilia, sao paulo, SP, CEP 01233-020",
  );
  // Sem localidade (ViaCEP fora): só o CEP entra.
  assert.equal(completeAddressWithLocality("Rua Y 5", "01233-020", null), "Rua Y 5, CEP 01233-020");
  assert.equal(completeAddressWithLocality("Rua Y 5", null, null), "Rua Y 5");
});
