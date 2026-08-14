/**
 * A tiny object-relational layer over Supabase.
 *
 * WHY NOT PRISMA, given this project already uses it?
 *
 * Prisma connects as the `postgres` superuser, which BYPASSES ROW-LEVEL
 * SECURITY entirely. Every policy in supabase/migrations would stop applying,
 * and shop A could read shop B's drafts, enquiries and analytics unless every
 * query in the app remembered to filter by shop -- which is exactly the
 * mistake RLS exists to make impossible.
 *
 * That is a fine trade for a single-tenant CMS. It is the wrong trade for a
 * marketplace where the tenants are competitors.
 *
 * So these classes speak to PostgREST through supabase-js, which carries the
 * caller's identity and has the policies enforced by the database. You get
 * objects and methods -- `shop.products()`, `product.isOnSpecial()` -- and
 * never write SQL, but the security model still holds.
 *
 * Prisma remains the right tool for server-side admin jobs where you WANT to
 * bypass policies. Both can address the same database.
 */

import { getSupabase } from "../supabase/client";

export class NotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY, or use the static catalogue."
    );
    this.name = "NotConfiguredError";
  }
}

/**
 * Base class for every domain object.
 *
 * Subclasses declare a `table` and get find/save/delete for free. Row data is
 * kept on `this.row` and exposed through getters, so a column rename is one
 * edit rather than a search across the app.
 */
export class Model {
  /** @type {string} Table or view this model reads from. */
  static table = null;

  /** Columns to select. Override to join related rows. */
  static columns = "*";

  constructor(row = {}) {
    this.row = row;
  }

  get id() {
    return this.row.id;
  }

  /** The client, or a clear error rather than a null dereference later. */
  static client() {
    const supabase = getSupabase();
    if (!supabase) throw new NotConfiguredError();
    return supabase;
  }

  static from() {
    return this.client().from(this.table).select(this.columns);
  }

  /** Wrap raw rows as model instances. */
  static hydrate(rows) {
    return (rows ?? []).map((row) => new this(row));
  }

  /**
   * Find many, with an optional filter object.
   *
   * `where` is a plain object of equality matches, which covers almost every
   * query this app makes. Anything more complex should be a named method on
   * the subclass rather than a query builder leaking into callers.
   */
  static async findMany(where = {}, { limit, orderBy, ascending = true } = {}) {
    let query = this.from().match(where);
    if (orderBy) query = query.order(orderBy, { ascending });
    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw new Error(`${this.name}.findMany: ${error.message}`);
    return this.hydrate(data);
  }

  /** Find one, or null. */
  static async findOne(where = {}) {
    const { data, error } = await this.from().match(where).limit(1).maybeSingle();
    if (error) throw new Error(`${this.name}.findOne: ${error.message}`);
    return data ? new this(data) : null;
  }

  static async findById(id) {
    return this.findOne({ id });
  }

  static async count(where = {}) {
    const { count, error } = await this.client()
      .from(this.table)
      .select("*", { count: "exact", head: true })
      .match(where);
    if (error) throw new Error(`${this.name}.count: ${error.message}`);
    return count ?? 0;
  }

  /**
   * Insert or update, depending on whether the row has an id.
   *
   * Whether this succeeds is decided by the row-level security policies, not
   * by this code -- a shop staffer saving another shop's product simply gets
   * an error from the database.
   */
  async save(patch = {}) {
    const Klass = this.constructor;
    const payload = { ...this.row, ...patch };
    delete payload.created_at;      // database-owned

    const query = this.id
      ? Klass.client().from(Klass.table).update(payload).eq("id", this.id)
      : Klass.client().from(Klass.table).insert(payload);

    const { data, error } = await query.select().single();
    if (error) throw new Error(`${Klass.name}.save: ${error.message}`);
    this.row = data;
    return this;
  }

  async delete() {
    const Klass = this.constructor;
    const { error } = await Klass.client()
      .from(Klass.table).delete().eq("id", this.id);
    if (error) throw new Error(`${Klass.name}.delete: ${error.message}`);
    return true;
  }

  toJSON() {
    return this.row;
  }
}

/**
 * Money helper: the database stores cents, people read currency.
 *
 * The locale is PINNED. Left to the runtime default, Node formats 18999 as
 * "18 999" with a narrow no-break space while a browser gives "18,999" -- so
 * server and client render different text and React reports a hydration
 * mismatch. Pinning it makes the output the same everywhere.
 */
export function money(cents, currency = "BWP") {
  if (cents == null) return null;
  const amount = (cents / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${currency === "BWP" ? "P" : currency} ${amount}`;
}
