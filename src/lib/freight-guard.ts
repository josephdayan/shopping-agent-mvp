// Guarda de frete: dentro de uma cidade coberta, um endereço ainda pode estar longe demais
// de QUALQUER loja parceira (a Grande SP é grande). Sem isto, o cliente paga e o pedido é
// impossível de entregar (Pix pago + estorno manual). Puro + unit-testado (estilo coverage.ts).
//
// DISTÂNCIA é a guarda primária: no sandbox toda cotação é mock e mock é barato, então uma
// guarda só por preço deixaria passar um SP→Salesópolis silencioso. Geometria não mente.
// FEE é secundária: só morde com cotação REAL (feeIsMock=false).
//
// Config por env (todas opcionais):
//   LIA_MAX_DELIVERY_KM    — raio máx. da loja mais próxima (default 12). 0/vazio desliga.
//   LIA_MAX_DELIVERY_FEE   — frete real máx. em R$ (default 35). 0/vazio desliga.
//   LIA_FREIGHT_GUARD_OFF=true — kill-switch (passa tudo).

export type FreightGuardInput = {
  distanceKm: number | null; // null = geo indisponível → checagem de distância fail-open
  fee?: number; // frete da cotação mais barata, quando houver
  feeIsMock?: boolean; // fee mock é fake-barato → checagem de fee é pulada
};

export type FreightBlock = { reason: "too_far" | "fee_too_high"; distanceKm?: number; fee?: number };

export function maxDeliveryKm(): number {
  return Number(process.env.LIA_MAX_DELIVERY_KM ?? 12);
}

function maxDeliveryFee(): number {
  return Number(process.env.LIA_MAX_DELIVERY_FEE ?? 35);
}

export function checkFreightGuard(input: FreightGuardInput): FreightBlock | null {
  if (process.env.LIA_FREIGHT_GUARD_OFF === "true") return null;

  // 1) Distância (primária). Só morde quando conhecemos a distância (caminho GEO).
  const maxKm = maxDeliveryKm();
  if (maxKm > 0 && input.distanceKm != null && input.distanceKm > maxKm) {
    return { reason: "too_far", distanceKm: input.distanceKm };
  }

  // 2) Fee real (secundária). Mock é ignorado.
  const maxFee = maxDeliveryFee();
  if (maxFee > 0 && input.fee != null && !input.feeIsMock && input.fee > maxFee) {
    return { reason: "fee_too_high", fee: input.fee };
  }

  // 3) Sinais ausentes → fail-open (o operador vê o pedido e pega o caso raro).
  return null;
}
