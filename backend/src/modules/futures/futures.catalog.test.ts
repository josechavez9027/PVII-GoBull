import { describe, it } from "node:test";
import assert from "node:assert";
import { FUTURES_CATEGORY_ORDER, FUTURES_DEFINITIONS } from "./futures.catalog";

const EXCLUDED = ["G", "NCF", "RS", "ZK", "SR3", "UX"];
const FINVIZ_CATEGORIES = [
  "RATES",
  "CURRENCIES",
  "METALS",
  "SOFTS",
  "ENERGY",
  "INDICES",
  "GRAINS",
];

describe("FUTURES_DEFINITIONS", () => {
  it("contiene los 54 futuros de Finviz con datos en Yahoo", () => {
    assert.strictEqual(FUTURES_DEFINITIONS.length, 54);
    for (const code of EXCLUDED) {
      assert.ok(
        !FUTURES_DEFINITIONS.some((definition) => definition.code === code),
        `${code} no deberia estar en el catalogo`,
      );
    }
  });

  it("usa codigos unicos y simbolos de Yahoo no vacios", () => {
    const codes = new Set<string>();
    for (const definition of FUTURES_DEFINITIONS) {
      assert.ok(definition.code.trim().length > 0);
      assert.ok(definition.yahooSymbol.trim().length > 0);
      assert.ok(!codes.has(definition.code), `codigo duplicado: ${definition.code}`);
      codes.add(definition.code);
    }
    assert.strictEqual(codes.size, FUTURES_DEFINITIONS.length);
  });

  it("replica las siete categorias de Finviz con el orden esperado", () => {
    assert.deepStrictEqual(FUTURES_CATEGORY_ORDER, FINVIZ_CATEGORIES);
    const used = new Set(FUTURES_DEFINITIONS.map((definition) => definition.category));
    assert.deepStrictEqual([...used].sort(), [...FINVIZ_CATEGORIES].sort());
  });
});
