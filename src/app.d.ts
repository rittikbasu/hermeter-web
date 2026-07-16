declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database;
      };
      context: ExecutionContext;
      caches: CacheStorage;
    }
  }
}

export {};
