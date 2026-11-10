import type { FuturesCategory, FuturesDefinition } from "./futures.types";

/**
 * Los 54 futuros de Finviz (https://finviz.com/futures/performance) que Yahoo
 * Finance puede alimentar. El codigo es el ticker de Finviz; `yahooSymbol` es el
 * contrato continuo `=F` o, cuando Yahoo no expone el futuro, el indice spot del
 * subyacente (documentado en el disclaimer).
 *
 * Se excluyeron los 6 instrumentos sin datos utilizables en Yahoo: G (gasoil),
 * NCF (carbon Newcastle), RS (canola), ZK (etanol), SR3 (SOFR) y UX (uranio).
 */
export const FUTURES_DEFINITIONS: FuturesDefinition[] = [
  // RATES
  { code: "10Y", name: "Rendimiento bono 10 anos", category: "RATES", yahooSymbol: "^TNX", unit: "%", decimals: 3, sortOrder: 1 },
  { code: "TN", name: "Ultra bono 10 anos", category: "RATES", yahooSymbol: "TN=F", unit: "pts", decimals: 3, sortOrder: 2 },
  { code: "UB", name: "Ultra bono 30 anos", category: "RATES", yahooSymbol: "UB=F", unit: "pts", decimals: 3, sortOrder: 3 },
  { code: "ZB", name: "Bono 30 anos", category: "RATES", yahooSymbol: "ZB=F", unit: "pts", decimals: 3, sortOrder: 4 },
  { code: "ZF", name: "Bono 5 anos", category: "RATES", yahooSymbol: "ZF=F", unit: "pts", decimals: 3, sortOrder: 5 },
  { code: "ZN", name: "Bono 10 anos", category: "RATES", yahooSymbol: "ZN=F", unit: "pts", decimals: 3, sortOrder: 6 },
  { code: "ZQ", name: "Tasa Fed Funds", category: "RATES", yahooSymbol: "ZQ=F", unit: "pts", decimals: 3, sortOrder: 7 },
  { code: "ZT", name: "Bono 2 anos", category: "RATES", yahooSymbol: "ZT=F", unit: "pts", decimals: 3, sortOrder: 8 },

  // CURRENCIES
  { code: "6A", name: "Dolar australiano", category: "CURRENCIES", yahooSymbol: "6A=F", unit: "USD", decimals: 4, sortOrder: 1 },
  { code: "6B", name: "Libra esterlina", category: "CURRENCIES", yahooSymbol: "6B=F", unit: "USD", decimals: 4, sortOrder: 2 },
  { code: "6C", name: "Dolar canadiense", category: "CURRENCIES", yahooSymbol: "6C=F", unit: "USD", decimals: 4, sortOrder: 3 },
  { code: "6E", name: "Euro", category: "CURRENCIES", yahooSymbol: "6E=F", unit: "USD", decimals: 4, sortOrder: 4 },
  { code: "6J", name: "Yen japones", category: "CURRENCIES", yahooSymbol: "6J=F", unit: "USD", decimals: 6, sortOrder: 5 },
  { code: "6N", name: "Dolar neozelandes", category: "CURRENCIES", yahooSymbol: "6N=F", unit: "USD", decimals: 4, sortOrder: 6 },
  { code: "6S", name: "Franco suizo", category: "CURRENCIES", yahooSymbol: "6S=F", unit: "USD", decimals: 4, sortOrder: 7 },
  { code: "BTC", name: "Bitcoin", category: "CURRENCIES", yahooSymbol: "BTC=F", unit: "USD", decimals: 0, sortOrder: 8 },
  { code: "DX", name: "Indice del dolar (spot)", category: "CURRENCIES", yahooSymbol: "DX-Y.NYB", unit: "pts", decimals: 3, sortOrder: 9 },

  // METALS
  { code: "ALI", name: "Aluminio", category: "METALS", yahooSymbol: "ALI=F", unit: "$/t", decimals: 2, sortOrder: 1 },
  { code: "GC", name: "Oro", category: "METALS", yahooSymbol: "GC=F", unit: "$/oz", decimals: 2, sortOrder: 2 },
  { code: "HG", name: "Cobre", category: "METALS", yahooSymbol: "HG=F", unit: "$/lb", decimals: 3, sortOrder: 3 },
  { code: "HRC", name: "Acero HRC", category: "METALS", yahooSymbol: "HRC=F", unit: "$/t", decimals: 2, sortOrder: 4 },
  { code: "PA", name: "Paladio", category: "METALS", yahooSymbol: "PA=F", unit: "$/oz", decimals: 2, sortOrder: 5 },
  { code: "PL", name: "Platino", category: "METALS", yahooSymbol: "PL=F", unit: "$/oz", decimals: 2, sortOrder: 6 },
  { code: "SI", name: "Plata", category: "METALS", yahooSymbol: "SI=F", unit: "$/oz", decimals: 3, sortOrder: 7 },
  { code: "TIO", name: "Mineral de hierro", category: "METALS", yahooSymbol: "TIO=F", unit: "$/t", decimals: 2, sortOrder: 8 },

  // SOFTS
  { code: "CC", name: "Cacao", category: "SOFTS", yahooSymbol: "CC=F", unit: "$/t", decimals: 2, sortOrder: 1 },
  { code: "CT", name: "Algodon", category: "SOFTS", yahooSymbol: "CT=F", unit: "¢/lb", decimals: 2, sortOrder: 2 },
  { code: "FC", name: "Ganado de engorda", category: "SOFTS", yahooSymbol: "GF=F", unit: "¢/lb", decimals: 2, sortOrder: 3 },
  { code: "JO", name: "Jugo de naranja", category: "SOFTS", yahooSymbol: "OJ=F", unit: "¢/lb", decimals: 2, sortOrder: 4 },
  { code: "KC", name: "Cafe", category: "SOFTS", yahooSymbol: "KC=F", unit: "¢/lb", decimals: 2, sortOrder: 5 },
  { code: "LB", name: "Madera", category: "SOFTS", yahooSymbol: "LBR=F", unit: "$/1000bf", decimals: 2, sortOrder: 6 },
  { code: "LC", name: "Ganado en pie", category: "SOFTS", yahooSymbol: "LE=F", unit: "¢/lb", decimals: 2, sortOrder: 7 },
  { code: "LH", name: "Cerdos", category: "SOFTS", yahooSymbol: "HE=F", unit: "¢/lb", decimals: 2, sortOrder: 8 },
  { code: "SB", name: "Azucar", category: "SOFTS", yahooSymbol: "SB=F", unit: "¢/lb", decimals: 2, sortOrder: 9 },

  // ENERGY
  { code: "CL", name: "Petroleo WTI", category: "ENERGY", yahooSymbol: "CL=F", unit: "$/bbl", decimals: 2, sortOrder: 1 },
  { code: "HO", name: "Diesel (heating oil)", category: "ENERGY", yahooSymbol: "HO=F", unit: "$/gal", decimals: 4, sortOrder: 2 },
  { code: "NG", name: "Gas natural", category: "ENERGY", yahooSymbol: "NG=F", unit: "$/MMBtu", decimals: 3, sortOrder: 3 },
  { code: "QA", name: "Petroleo Brent", category: "ENERGY", yahooSymbol: "BZ=F", unit: "$/bbl", decimals: 2, sortOrder: 4 },
  { code: "RB", name: "Gasolina RBOB", category: "ENERGY", yahooSymbol: "RB=F", unit: "$/gal", decimals: 4, sortOrder: 5 },

  // INDICES
  { code: "DY", name: "DAX (spot)", category: "INDICES", yahooSymbol: "^GDAXI", unit: "pts", decimals: 2, sortOrder: 1 },
  { code: "ER2", name: "Russell 2000", category: "INDICES", yahooSymbol: "RTY=F", unit: "pts", decimals: 2, sortOrder: 2 },
  { code: "ES", name: "S&P 500", category: "INDICES", yahooSymbol: "ES=F", unit: "pts", decimals: 2, sortOrder: 3 },
  { code: "EX", name: "Euro Stoxx 50 (spot)", category: "INDICES", yahooSymbol: "^STOXX50E", unit: "pts", decimals: 2, sortOrder: 4 },
  { code: "NKD", name: "Nikkei 225", category: "INDICES", yahooSymbol: "NKD=F", unit: "pts", decimals: 2, sortOrder: 5 },
  { code: "NQ", name: "Nasdaq 100", category: "INDICES", yahooSymbol: "NQ=F", unit: "pts", decimals: 2, sortOrder: 6 },
  { code: "VX", name: "VIX (spot)", category: "INDICES", yahooSymbol: "^VIX", unit: "pts", decimals: 2, sortOrder: 7 },
  { code: "YM", name: "Dow Jones", category: "INDICES", yahooSymbol: "YM=F", unit: "pts", decimals: 2, sortOrder: 8 },

  // GRAINS
  { code: "ZC", name: "Maiz", category: "GRAINS", yahooSymbol: "ZC=F", unit: "¢/bu", decimals: 2, sortOrder: 1 },
  { code: "ZL", name: "Aceite de soya", category: "GRAINS", yahooSymbol: "ZL=F", unit: "¢/lb", decimals: 2, sortOrder: 2 },
  { code: "ZM", name: "Harina de soya", category: "GRAINS", yahooSymbol: "ZM=F", unit: "$/t", decimals: 2, sortOrder: 3 },
  { code: "ZO", name: "Avena", category: "GRAINS", yahooSymbol: "ZO=F", unit: "¢/bu", decimals: 2, sortOrder: 4 },
  { code: "ZR", name: "Arroz", category: "GRAINS", yahooSymbol: "ZR=F", unit: "$/cwt", decimals: 2, sortOrder: 5 },
  { code: "ZS", name: "Soya", category: "GRAINS", yahooSymbol: "ZS=F", unit: "¢/bu", decimals: 2, sortOrder: 6 },
  { code: "ZW", name: "Trigo", category: "GRAINS", yahooSymbol: "ZW=F", unit: "¢/bu", decimals: 2, sortOrder: 7 },
];

export const FUTURES_CATEGORY_ORDER: FuturesCategory[] = [
  "RATES",
  "CURRENCIES",
  "METALS",
  "SOFTS",
  "ENERGY",
  "INDICES",
  "GRAINS",
];

export function futuresDefinition(code: string): FuturesDefinition | undefined {
  return FUTURES_DEFINITIONS.find((definition) => definition.code === code);
}
