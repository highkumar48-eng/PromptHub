export function database(env) {
  if (!env.DB) throw new Error('Database unavailable');
  return {
    one: (sql, ...args) => env.DB.prepare(sql).bind(...args).first(),
    all: async (sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results,
    run: (sql, ...args) => env.DB.prepare(sql).bind(...args).run(),
    batch: statements => env.DB.batch(statements.map(([sql, args]) => env.DB.prepare(sql).bind(...args))),
  };
}
