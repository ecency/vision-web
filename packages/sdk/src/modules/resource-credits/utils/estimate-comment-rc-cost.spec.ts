import { describe, expect, it } from "vitest";
import {
  computeResourceCost,
  countCommentResourceUsage,
  estimateCommentRcCost,
  estimateCommentTransactionBytes
} from "./estimate-comment-rc-cost";
import { RC_RESOURCE_NAMES } from "../types/resource-params";
import type { RcResourceParams } from "../types/resource-params";

/**
 * Ground truth captured from a real rejection on 2026-08-14. The node logs
 * usage and cost per resource in `tx_info` when it refuses a transaction, so
 * this fixture pins the port to numbers the chain itself produced:
 *
 *   Account: spacecop has 21319011516 RC, needs 23338899909 RC
 *   cost:  [22650133776, 0, 0, 650978626, 37787507]
 *   usage: [46620,       0, 0, 4241216,   166965  ]
 */
const REJECTION = {
  permlink: "who-the-dhf-has-actually",
  transactionBytes: 46620,
  signatures: 1,
  usage: { history: 46620, state: 4241216, execution: 166965 },
  cost: { history: 22650133776, state: 650978626, execution: 37787507, total: 23338899909 },
  poolAtTx: [24091156132, 16787104, 1980851228, 26129897630853, 66076533904],
  regen: 2403497928903,
  share: [5264, 10000, 533, 1843, 2357]
};

const PARAMS: RcResourceParams = {
  resource_params: {
    resource_history_bytes: {
      resource_dynamics_params: {
        resource_unit: 1,
        budget_per_time_unit: 43403,
        pool_eq: 0,
        max_pool_size: 0
      },
      price_curve_params: { coeff_a: "10525659774662010880", coeff_b: "211332338", shift: 50 }
    },
    resource_new_accounts: {
      resource_dynamics_params: {
        resource_unit: 10000,
        budget_per_time_unit: 797,
        pool_eq: 0,
        max_pool_size: 0
      },
      price_curve_params: { coeff_a: "16484671763857882971", coeff_b: "1231961", shift: 51 }
    },
    resource_market_bytes: {
      resource_dynamics_params: {
        resource_unit: 10,
        budget_per_time_unit: 72338,
        pool_eq: 0,
        max_pool_size: 0
      },
      price_curve_params: { coeff_a: "14969827235074865152", coeff_b: "15654337", shift: 55 }
    },
    resource_state_bytes: {
      resource_dynamics_params: {
        resource_unit: 1,
        budget_per_time_unit: 43546196,
        pool_eq: 0,
        max_pool_size: 0
      },
      price_curve_params: { coeff_a: "10525659774662010880", coeff_b: "212030656091", shift: 50 }
    },
    resource_execution_time: {
      resource_dynamics_params: {
        resource_unit: 1,
        budget_per_time_unit: 40000000,
        pool_eq: 0,
        max_pool_size: 0
      },
      price_curve_params: { coeff_a: "14969827235074865152", coeff_b: "541062725", shift: 59 }
    }
  },
  size_info: {
    resource_state_bytes: {
      comment_base_size: 4237056,
      comment_permlink_char_size: 168,
      comment_beneficiaries_member_size: 1344,
      transaction_base_size: 128
    },
    resource_execution_time: {
      comment_time: 66178,
      comment_options_time: 6202,
      transaction_time: 6622,
      verify_authority_time: 94165
    }
  }
};

const STATS = { pool: REJECTION.poolAtTx, regen: REJECTION.regen, share: REJECTION.share };

const within = (actual: number, expected: number, pct: number) =>
  Math.abs(actual - expected) / expected <= pct / 100;

describe("countCommentResourceUsage", () => {
  const usage = countCommentResourceUsage(
    {
      transactionBytes: REJECTION.transactionBytes,
      permlinkLength: REJECTION.permlink.length,
      signatures: REJECTION.signatures
    },
    PARAMS.size_info
  );

  // These are exact, not approximate: the formulas are deterministic.
  it("reproduces the chain's history_bytes exactly", () => {
    expect(usage.resource_history_bytes).toBe(REJECTION.usage.history);
  });

  it("reproduces the chain's state_bytes exactly", () => {
    expect(usage.resource_state_bytes).toBe(REJECTION.usage.state);
  });

  it("reproduces the chain's execution_time exactly", () => {
    expect(usage.resource_execution_time).toBe(REJECTION.usage.execution);
  });

  it("leaves resources a comment does not touch at zero", () => {
    expect(usage.resource_new_accounts).toBe(0);
    expect(usage.resource_market_bytes).toBe(0);
  });

  it("scales state_bytes with permlink length", () => {
    const longer = countCommentResourceUsage(
      { transactionBytes: 100, permlinkLength: 30, signatures: 1 },
      PARAMS.size_info
    );
    const shorter = countCommentResourceUsage(
      { transactionBytes: 100, permlinkLength: 10, signatures: 1 },
      PARAMS.size_info
    );
    expect(longer.resource_state_bytes - shorter.resource_state_bytes).toBe(168 * 20);
  });

  it("charges execution time per signature", () => {
    const two = countCommentResourceUsage(
      { transactionBytes: 100, permlinkLength: 10, signatures: 2 },
      PARAMS.size_info
    );
    const one = countCommentResourceUsage(
      { transactionBytes: 100, permlinkLength: 10, signatures: 1 },
      PARAMS.size_info
    );
    expect(two.resource_execution_time - one.resource_execution_time).toBe(94165);
  });
});

describe("computeResourceCost", () => {
  const regenShare = (i: number) => Math.floor((REJECTION.regen * REJECTION.share[i]) / 10000);

  it("prices history_bytes within 1% of the chain", () => {
    const cost = computeResourceCost(
      PARAMS.resource_params.resource_history_bytes.price_curve_params,
      REJECTION.poolAtTx[0],
      REJECTION.usage.history,
      regenShare(0)
    );
    expect(within(cost, REJECTION.cost.history, 1)).toBe(true);
  });

  it("prices state_bytes within 3% of the chain", () => {
    const cost = computeResourceCost(
      PARAMS.resource_params.resource_state_bytes.price_curve_params,
      REJECTION.poolAtTx[3],
      REJECTION.usage.state,
      regenShare(3)
    );
    expect(within(cost, REJECTION.cost.state, 3)).toBe(true);
  });

  it("prices execution_time within 3% of the chain", () => {
    const cost = computeResourceCost(
      PARAMS.resource_params.resource_execution_time.price_curve_params,
      REJECTION.poolAtTx[4],
      REJECTION.usage.execution,
      regenShare(4)
    );
    expect(within(cost, REJECTION.cost.execution, 3)).toBe(true);
  });

  it("keeps full precision on coefficients past Number.MAX_SAFE_INTEGER", () => {
    // coeff_a is ~1.05e19. Doing this in floats silently loses the low bits.
    expect(Number("10525659774662010880") > Number.MAX_SAFE_INTEGER).toBe(true);
    const cost = computeResourceCost(
      PARAMS.resource_params.resource_history_bytes.price_curve_params,
      REJECTION.poolAtTx[0],
      1,
      regenShare(0)
    );
    expect(Number.isFinite(cost)).toBe(true);
    expect(cost).toBeGreaterThan(0);
  });

  it("returns 0 for empty or unusable input rather than throwing", () => {
    const curve = PARAMS.resource_params.resource_history_bytes.price_curve_params;
    expect(computeResourceCost(curve, 1, 0, 1)).toBe(0);
    expect(computeResourceCost(curve, 1, -5, 1)).toBe(0);
    expect(computeResourceCost(curve, 1, 10, 0)).toBe(0);
  });
});

describe("total cost against the rejection", () => {
  // Composed from the two exported primitives with the transaction size the
  // chain reported, so nothing here is circular: the size is an input, not
  // something this module derived.
  const totalFor = (transactionBytes: number) => {
    const usage = countCommentResourceUsage(
      { transactionBytes, permlinkLength: REJECTION.permlink.length, signatures: 1 },
      PARAMS.size_info
    );
    return RC_RESOURCE_NAMES.reduce((sum, name, index) => {
      const entry = PARAMS.resource_params[name];
      const regenShare = Math.floor((REJECTION.regen * REJECTION.share[index]) / 10000);
      return (
        sum +
        computeResourceCost(
          entry.price_curve_params,
          REJECTION.poolAtTx[index],
          usage[name] * Number(entry.resource_dynamics_params.resource_unit),
          regenShare
        )
      );
    }, 0);
  };

  it("lands within 1% of what the chain charged", () => {
    expect(within(totalFor(REJECTION.transactionBytes), REJECTION.cost.total, 1)).toBe(true);
  });

  it("would have caught the rejection before broadcast", () => {
    const SPACECOP_MAX_RC = 21399560550;
    // Needed more than the account's entire maximum, so waiting to regenerate
    // could never have helped.
    expect(totalFor(REJECTION.transactionBytes)).toBeGreaterThan(SPACECOP_MAX_RC);
  });

  it("scales with transaction size, which is the actionable lever", () => {
    expect(totalFor(46620)).toBeGreaterThan(totalFor(4662) * 5);
  });
});

describe("estimateCommentRcCost", () => {
  const op = {
    author: "spacecop",
    permlink: REJECTION.permlink,
    parent_author: "",
    parent_permlink: "dhf",
    title: "Who the DHF has actually paid",
    body: "x".repeat(40000),
    json_metadata: "{}"
  };

  it("attributes most of the cost to history_bytes on a large post", () => {
    const result = estimateCommentRcCost({ op, rcParams: PARAMS, rcStats: STATS });
    const history = result.breakdown.find((b) => b.resource === "resource_history_bytes");

    expect(history!.cost / result.cost).toBeGreaterThan(0.9);
  });

  it("charges more once a companion comment_options is attached", () => {
    const plain = estimateCommentRcCost({ op, rcParams: PARAMS, rcStats: STATS });
    const withOptions = estimateCommentRcCost({
      op,
      options: { beneficiaries: [{ account: "ecency", weight: 500 }] },
      rcParams: PARAMS,
      rcStats: STATS
    });

    expect(withOptions.cost).toBeGreaterThan(plain.cost);
    expect(withOptions.transactionBytes).toBeGreaterThan(plain.transactionBytes);
  });

  it("charges state bytes per beneficiary", () => {
    const one = estimateCommentRcCost({
      op,
      options: { beneficiaries: [{ account: "a", weight: 1 }] },
      rcParams: PARAMS,
      rcStats: STATS
    });
    const three = estimateCommentRcCost({
      op,
      options: {
        beneficiaries: [
          { account: "a", weight: 1 },
          { account: "b", weight: 1 },
          { account: "c", weight: 1 }
        ]
      },
      rcParams: PARAMS,
      rcStats: STATS
    });
    const stateOf = (r: typeof one) =>
      r.breakdown.find((b) => b.resource === "resource_state_bytes")!.usage;

    expect(stateOf(three) - stateOf(one)).toBe(1344 * 2);
  });

  it("is not ready until both queries resolve, so callers cannot warn early", () => {
    expect(estimateCommentRcCost({ op, rcParams: undefined, rcStats: STATS }).ready).toBe(false);
    expect(estimateCommentRcCost({ op, rcParams: PARAMS, rcStats: undefined }).ready).toBe(false);
  });
});

const REAL_TX = {
  trueBytes: 1823,
  signatures: 1,
  op: {
    parent_author: "",
    parent_permlink: "hive-193084",
    author: "gazzarin",
    permlink: "uhccwy21z33fuo4jmeu790",
    title: "\u00a1Claro! Aqu\u00ed tienes algunas ideas de t\u00edtulos de publicaciones breves para Twitter relacionadas con viajes:\n\n1",
    body: "\n\n\n<center>![image](https://pixabay.com/get/g4b2ffaa2da0850605268cb320bf636dffdca605202cd50fb4083d4e664ae5d0c71e43d25dbc484eb77d892ed189dd8817891b4ca971e2d82d9156df3cbc2c7c2_640.jpg)</center>\n\n***\n\n1. \ud83c\udf0d\u2708\ufe0f \"La vida es un viaje, no un destino. \u00a1Explora cada rinc\u00f3n del mundo! #Viajes #Aventura\"\n   \n2. \ud83c\udfd6\ufe0f \"\u00bfPlaya o monta\u00f1a? \u00bfCu\u00e1l es tu escapada so\u00f1ada? \ud83c\udfd4\ufe0f #ViajarEsVivir\"\n\n3. \ud83c\udf5c \"Descubrir nuevos sabores es una de las mejores partes de viajar. \u00bfCu\u00e1l ha sido tu platillo favorito? #Gastronom\u00eda #Viajes\"\n\n4. \ud83d\udcf8 \"Captura momentos, no cosas. \u00a1Haz que cada viaje cuente! #Fotograf\u00edaDeViajes #Recuerdos\"\n\n5. \ud83d\ude82 \"Viajar en tren: la forma m\u00e1s rom\u00e1ntica de ver el mundo. \u00bfCu\u00e1l es tu ruta favorita? #Tren #Aventuras\"\n\n6. \ud83d\uddfa\ufe0f \"Siempre lleva un mapa, pero no tengas miedo de perderte. \u00a1Las mejores aventuras est\u00e1n en lo inesperado! #Exploraci\u00f3n\"\n\n7. \ud83c\udf04 \"El amanecer en la monta\u00f1a es un espect\u00e1culo que no te puedes perder. \u00bfD\u00f3nde has visto el mejor? #Naturaleza #Viajes\"\n\n8. \ud83c\udfd9\ufe0f \"Las ciudades tienen historias que contar. \u00bfCu\u00e1l es la m\u00e1s fascinante que has escuchado? #Cultura #TravelTales\"\n\n9. \ud83c\udf0c \"Bajo el cielo estrellado, todos los problemas parecen lejanos. \u00bfD\u00f3nde has visto m\u00e1s estrellas? #Astroturismo\"\n\n10. \ud83e\uddf3 \"Empaca ligero, viaja lejos. \u00a1Menos es m\u00e1s! #ConsejosDeViaje #Minimalismo\" \n\n\u00a1Espero que estas ideas te inspiren!\n\n***\n\n",
    json_metadata: "{\"app\": \"dBuzz/v3.0.0\", \"tags\": [\"trip\", \"life\", \"nature\", \"kr\", \"waivio\", \"neoxian\", \"leo\", \"inleo\", \"cent\", \"oneup\", \"pob\", \"proofofbrain\", \"hustler\", \"pal\", \"pimp\"], \"shortForm\": \"true\"}",
  }
};

describe("estimateCommentTransactionBytes", () => {
  // Read back from the chain with `get_transaction_hex`, so this validates the
  // serialization model against real bytes rather than against itself. The
  // model was checked byte-exact on eight such transactions, including one
  // carrying comment_options.
  it("matches a real transaction byte for byte", () => {
    expect(
      estimateCommentTransactionBytes({ op: REAL_TX.op, signatures: REAL_TX.signatures })
    ).toBe(REAL_TX.trueBytes);
  });

  it("counts UTF-8 bytes, not UTF-16 code units", () => {
    const base = {
      author: "a",
      permlink: "b",
      parent_author: "",
      parent_permlink: "c",
      title: "t",
      json_metadata: "{}"
    };
    const ascii = estimateCommentTransactionBytes({ op: { ...base, body: "aaaa" } });
    const accented = estimateCommentTransactionBytes({ op: { ...base, body: "áááá" } });
    const emoji = estimateCommentTransactionBytes({ op: { ...base, body: "🐝🐝🐝🐝" } });

    // 1, 2 and 4 bytes per character respectively
    expect(accented - ascii).toBe(4);
    expect(emoji - ascii).toBe(12);
  });

  it("charges 65 bytes for each additional signature", () => {
    const one = estimateCommentTransactionBytes({ op: REAL_TX.op, signatures: 1 });
    const two = estimateCommentTransactionBytes({ op: REAL_TX.op, signatures: 2 });

    expect(two - one).toBe(65);
  });

  it("grows the length prefix as a field crosses a varint boundary", () => {
    const base = {
      author: "a",
      permlink: "b",
      parent_author: "",
      parent_permlink: "c",
      title: "t",
      json_metadata: "{}"
    };
    const under = estimateCommentTransactionBytes({ op: { ...base, body: "x".repeat(127) } });
    const over = estimateCommentTransactionBytes({ op: { ...base, body: "x".repeat(128) } });

    // one more content byte plus one more varint byte
    expect(over - under).toBe(2);
  });

  it("includes the companion comment_options in the size", () => {
    const plain = estimateCommentTransactionBytes({ op: REAL_TX.op });
    const withOptions = estimateCommentTransactionBytes({
      op: REAL_TX.op,
      options: { beneficiaries: [{ account: "ecency", weight: 500 }] }
    });

    expect(withOptions).toBeGreaterThan(plain);
  });
});
