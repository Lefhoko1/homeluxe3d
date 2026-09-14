import Anthropic from "@anthropic-ai/sdk";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  buildHouse,
  checkPlacement,
  describeHouse,
  describeRoom,
} from "../../../../lib/admin/placementGeometry";

/**
 * Place, move, turn or resize a product by asking for it in words.
 *
 * The admin describes what they want -- "put it on the TV stand", "back it
 * onto the window wall facing the television", "20cm further east" -- and
 * Claude works it out against the house as it stands right now: the rooms and
 * walls the 3D view loads, the doors, the visitors' walking route, and every
 * live placement with its size.
 *
 * CLAUDE DECIDES, THE CHECKER MEASURES. The assistant's tools include
 * `check_placement`, which measures a candidate against walls, furniture,
 * doorways, the walking route and whatever the product would be sitting on,
 * and reports what is wrong in millimetres. It checks before it proposes, and
 * the proposal the admin sees carries that check with it.
 *
 * NOTHING IS SAVED HERE. The route returns a transform; the admin screen
 * applies it to the object in the editor, unsaved, and the admin presses Save
 * exactly as they would after dragging it. A wrong suggestion costs a Revert.
 *
 * ADMIN ONLY. The caller's Supabase session is forwarded as a bearer token and
 * checked against `is_platform_admin`. The route uses the ordinary anon key
 * with that token, so it can read nothing the admin could not read themselves.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A few tool calls with thinking. Vercel stops a function at its plan's limit,
// so keep this within it.
export const maxDuration = 60;

/**
 * How hard the model thinks. The checker carries the precision, so the model
 * is deciding intent and reading measurements back, and "medium" keeps a
 * request inside the function's time limit. Raise it if placements are
 * sensible but slow to converge.
 */
const EFFORT = "medium" as const;

/** Tool-call rounds before giving up on a request. */
const MAX_ITERATIONS = 12;

/** Earlier prompts and replies sent back for follow-ups, most recent last. */
const HISTORY_TURNS = 10;

const SYSTEM = `You place 3D product models inside a furnished show house, for the site's administrator.

The house uses plan coordinates in millimetres:
- x increases to the east, y increases to the north, z is height above the floor.
- A product's x_mm and y_mm are the CENTRE of its footprint. z_mm is the height of its underside: 0 stands on the floor, and something standing on a TV stand has z_mm equal to the top of the stand.
- rotation_deg turns the product about the vertical axis. At 0 its front faces north; -90 faces east, 90 faces west, 180 faces south. At 0 its width runs east-west and its depth north-south; at 90 or -90 they swap.
- scale multiplies the model's size. Leave it at 1 unless the administrator asks for a different size.

How to work:
1. Look before placing. Call describe_room for the room the request concerns. It lists each side's solid wall, windows and open stretches, the doors, the furniture already there with footprints and heights, and points on the visitors' walking route.
2. Work out a candidate transform and call check_placement with it. The check is exact and your own arithmetic is not, so trust what it reports.
3. If it reports issues, adjust and check again. Keep 20-50mm between a product's back and the wall it stands against. For something placed on another item, such as a decoder on a TV stand or a lamp on a side table, use the surface_z_mm the check reports so it neither floats nor sinks, and keep it within the edges of that item.
4. When a candidate passes, or it is the best available, call propose_placement once with it. Only a proposed placement is applied; describing a position in words does nothing.
5. Then tell the administrator in one or two sentences where it went and why, and name any issue you could not resolve.

For follow-up requests such as "move it 20cm left", "turn it to face the TV" or "put it on the stand", start from the current transform you are given, change only what was asked, then check and propose again. Left, right, forward and back are ambiguous in a room: choose the reading that fits the room and say which one you used.

The administrator reviews and saves the proposal themselves. Never say it has been saved.`;

type Turn = { role: "user" | "assistant"; text: string };

type Transform = {
  x_mm: number;
  y_mm: number;
  z_mm: number;
  rotation_deg: number;
  scale: number;
};

type RequestBody = {
  variantId?: string;
  placementId?: string | null;
  transform?: Transform | null;
  prompt?: string;
  history?: Turn[];
};

type ProductRow = {
  id: string;
  anchor: unknown;
  products: {
    id: string;
    name: string;
    category_code: string | null;
    description: string | null;
    width_mm: number | null;
    depth_mm: number | null;
    height_mm: number | null;
    product_room_types: { room_type: string }[] | null;
  } | null;
};

const TRANSFORM_SCHEMA = {
  type: "object",
  properties: {
    x_mm: { type: "number", description: "Footprint centre, east-west, millimetres." },
    y_mm: { type: "number", description: "Footprint centre, north-south, millimetres." },
    z_mm: { type: "number", description: "Height of the product's underside above the floor, millimetres." },
    rotation_deg: { type: "number", description: "Degrees about vertical. 0 faces north, -90 east, 90 west, 180 south." },
    scale: { type: "number", description: "Uniform size multiplier. 1 is the product's real size." },
  },
  required: ["x_mm", "y_mm", "z_mm", "rotation_deg", "scale"],
  additionalProperties: false,
} as const;

const PROPOSAL_SCHEMA = {
  type: "object",
  properties: {
    x_mm: TRANSFORM_SCHEMA.properties.x_mm,
    y_mm: TRANSFORM_SCHEMA.properties.y_mm,
    z_mm: TRANSFORM_SCHEMA.properties.z_mm,
    rotation_deg: TRANSFORM_SCHEMA.properties.rotation_deg,
    scale: TRANSFORM_SCHEMA.properties.scale,
    summary: { type: "string", description: "One sentence: where it is and why." },
  },
  required: ["x_mm", "y_mm", "z_mm", "rotation_deg", "scale", "summary"],
  additionalProperties: false,
} as const;

/**
 * The SDK's `betaTool` infers each tool's input type from its JSON schema, and
 * on these schemas that inference is "excessively deep" for the TypeScript
 * checker and fails the build. This builds the same runnable tool with the
 * input type stated instead of inferred.
 */
function customTool<Input>(options: {
  name: string;
  description: string;
  inputSchema: { type: "object"; [key: string]: unknown };
  run: (input: Input) => Promise<string>;
}): BetaRunnableTool<Input> {
  return {
    type: "custom",
    name: options.name,
    description: options.description,
    input_schema: options.inputSchema,
    run: options.run,
    parse: (content: unknown) => content as Input,
  };
}

export async function POST(request: Request) {
  // -- configuration ------------------------------------------------------
  // Checked up front and reported plainly: a missing key is a deployment
  // step, and it should say which one rather than fail somewhere inside.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "AI placement is not configured: set ANTHROPIC_API_KEY in .env.local " +
          "for local use and in the Vercel project's environment variables.",
      },
      { status: 503 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  }

  // -- who is asking ------------------------------------------------------
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ ok: false, error: "Sign in as an administrator." }, { status: 401 });
  }
  const db = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: isAdmin, error: adminError } = await db.rpc("is_platform_admin");
  if (adminError || isAdmin !== true) {
    return NextResponse.json(
      { ok: false, error: "Only a platform administrator can use AI placement." },
      { status: 403 },
    );
  }

  // -- what is being asked ------------------------------------------------
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "The request was not valid JSON." }, { status: 400 });
  }
  const prompt = (body.prompt ?? "").trim();
  if (!body.variantId || !prompt) {
    return NextResponse.json(
      { ok: false, error: "Select a product and describe where it should go." },
      { status: 400 },
    );
  }

  // -- the product --------------------------------------------------------
  const { data: variant, error: variantError } = await db
    .from("product_variants")
    .select(
      "id, anchor, products(id, name, category_code, description, width_mm, depth_mm, height_mm, " +
        "product_room_types(room_type))",
    )
    .eq("id", body.variantId)
    .single<ProductRow>();
  if (variantError || !variant?.products) {
    return NextResponse.json({ ok: false, error: "That product could not be found." }, { status: 404 });
  }
  const row = variant.products;
  if (!row.width_mm || !row.depth_mm || !row.height_mm) {
    return NextResponse.json(
      {
        ok: false,
        error:
          `${row.name} has no recorded width, depth and height, so it cannot be ` +
          "measured against the room. Add its dimensions on the Products screen.",
      },
      { status: 422 },
    );
  }
  const product = {
    name: row.name,
    category: row.category_code,
    width_mm: Number(row.width_mm),
    depth_mm: Number(row.depth_mm),
    height_mm: Number(row.height_mm),
    room_types: (row.product_room_types ?? []).map((r) => r.room_type),
  };

  // -- the house, as it stands now -----------------------------------------
  const origin = new URL(request.url).origin;
  const readJson = async (path: string) => {
    const response = await fetch(new URL(path, origin), { cache: "no-store" });
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    return response.json();
  };

  let house: ReturnType<typeof buildHouse>;
  try {
    const [collision, doors, tour, placements] = await Promise.all([
      readJson("/models/house/collision.json"),
      readJson("/models/house/doors.json"),
      readJson("/models/tour/tour.json"),
      db
        .from("v_live_placements")
        .select(
          "placement_id, product_name, category_code, x_mm, y_mm, z_mm, rotation_deg, scale, " +
            "width_mm, depth_mm, height_mm, model_url",
        )
        .eq("scene_slug", "3bed")
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          return data ?? [];
        }),
    ]);
    house = buildHouse({ collision, doors, tour, placements });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: `Could not read the house: ${error instanceof Error ? error.message : error}` },
      { status: 502 },
    );
  }

  const exclude = body.placementId ?? null;
  const measure = (transform: Transform) =>
    checkPlacement(house, { product, transform, excludePlacementId: exclude });

  // -- the tools ------------------------------------------------------------
  let proposal: (Transform & { summary: string; check: ReturnType<typeof checkPlacement> }) | null = null;

  const tools = [
    customTool<{ room_code: string }>({
      name: "describe_room",
      description:
        "Describe one room: its bounds, each side's solid wall, windows and open stretches, its doors, " +
        "the furniture in it with footprints and heights, and points on the visitors' walking route. " +
        "All in plan millimetres.",
      inputSchema: {
        type: "object",
        properties: {
          room_code: { type: "string", description: "A room code from the room list, e.g. living." },
        },
        required: ["room_code"],
        additionalProperties: false,
      },
      run: async ({ room_code }) => JSON.stringify(describeRoom(house, room_code)),
    }),
    customTool<Transform>({
      name: "check_placement",
      description:
        "Measure a candidate transform for the product being placed. Reports the room it lands in, " +
        "what it sits on and the surface height (surface_z_mm), and any issues: overlapping walls or " +
        "furniture, floating or sunk, standing in a doorway, or blocking the walking route.",
      inputSchema: TRANSFORM_SCHEMA,
      run: async (input) => JSON.stringify(measure(input)),
    }),
    customTool<Transform & { summary: string }>({
      name: "propose_placement",
      description:
        "Give the administrator the final transform. Call this once, after checking. It is applied to the " +
        "product in the editor, unsaved, for the administrator to review.",
      inputSchema: PROPOSAL_SCHEMA,
      run: async ({ summary, ...transform }) => {
        const check = measure(transform);
        proposal = { ...transform, summary, check };
        return JSON.stringify({
          recorded: true,
          ok: check.ok,
          issues: check.issues.map((issue) => issue.message),
        });
      },
    }),
  ];

  // -- the conversation -------------------------------------------------------
  const current = body.transform
    ? { transform: body.transform, check: measure(body.transform) }
    : null;

  const context = [
    "PRODUCT",
    JSON.stringify({
      ...product,
      saved: Boolean(exclude),
    }),
    "",
    "CURRENT TRANSFORM IN THE EDITOR (unsaved)",
    current
      ? JSON.stringify(current)
      : "None: it has only just been dropped into the house, so treat its position as meaningless.",
    "",
    "ROOMS",
    JSON.stringify(describeHouse(house)),
    "",
    `REQUEST: ${prompt}`,
  ].join("\n");

  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const turn of (body.history ?? []).slice(-HISTORY_TURNS)) {
    const text = String(turn?.text ?? "").slice(0, 4000);
    if (!text) continue;
    messages.push({ role: turn.role === "assistant" ? "assistant" : "user", content: text });
  }
  // The conversation has to open with the administrator, not the assistant.
  while (messages.length && messages[0].role !== "user") messages.shift();
  messages.push({ role: "user", content: context });

  const client = new Anthropic();

  try {
    const final = await client.beta.messages.toolRunner({
      model: "claude-opus-5",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT },
      // A declined request is re-run on another model server-side rather
      // than coming back empty.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      tools,
      max_iterations: MAX_ITERATIONS,
      messages,
    });

    if (final.stop_reason === "refusal") {
      return NextResponse.json(
        { ok: false, error: "The assistant declined this request. Try rewording it." },
        { status: 422 },
      );
    }

    const reply = final.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return NextResponse.json({
      ok: true,
      reply: reply || (proposal ? "Placed." : "I could not find a position for it."),
      proposal,
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { ok: false, error: "The ANTHROPIC_API_KEY was rejected. Check the key in the environment." },
        { status: 503 },
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { ok: false, error: "The AI service is busy. Wait a moment and ask again." },
        { status: 429 },
      );
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { ok: false, error: `The AI service returned an error (${error.status}).` },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
