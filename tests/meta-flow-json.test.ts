// Limites do Flow JSON da Meta que já derrubaram um publish (04/09): rótulo de TextInput
// ≤ 20, título de tela ≤ 30, rótulo de Footer ≤ 35, todo campo de `data` com __example__.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ADDRESS_FLOW_JSON, META_PROMPTS } from "../src/lib/meta-setup";

test("flow de endereço respeita os limites da Meta", () => {
  for (const screen of ADDRESS_FLOW_JSON.screens as any[]) {
    assert.ok(screen.title.length <= 30, screen.title);
    for (const [key, spec] of Object.entries(screen.data as Record<string, any>)) assert.ok(spec.__example__, key);
    const walk = (nodes: any[]) => {
      for (const n of nodes) {
        if (n.type === "TextInput") assert.ok(n.label.length <= 20, `${n.name}: "${n.label}" (${n.label.length})`);
        if (n.type === "Footer") assert.ok(n.label.length <= 35, n.label);
        assert.equal("init-value" in n, false, `${n.type} ${n.name ?? ""}: init-value não é aceito pela Meta`);
        if (n.children) walk(n.children);
      }
    };
    walk(screen.layout.children);
  }
});

test("ice breakers: até 4, cada um ≤ 80 caracteres", () => {
  assert.ok(META_PROMPTS.length <= 4);
  for (const p of META_PROMPTS) assert.ok(p.length <= 80, p);
});
