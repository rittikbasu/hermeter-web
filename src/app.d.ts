declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database;
        SNAPSHOTS: KVNamespace;
      };
      context: ExecutionContext;
      caches: CacheStorage;
    }
  }
}

export {};
