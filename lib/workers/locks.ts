import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function tryWorkerAdvisoryLock(lockKey: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("try_advisory_lock", { lock_key: lockKey });

  if (error) {
    console.warn("[worker.lock] rpc missing or failed; proceeding without advisory lock", {
      lockKey,
      message: error.message,
    });
    return true;
  }

  return Boolean((data as any)?.locked ?? data);
}

export async function releaseWorkerAdvisoryLock(lockKey: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("advisory_unlock", { lock_key: lockKey });
  if (error) {
    console.warn("[worker.lock] unlock rpc failed", { lockKey, message: error.message });
  }
}

export async function withWorkerLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
  const locked = await tryWorkerAdvisoryLock(lockKey);
  if (!locked) {
    const err = new Error("worker_already_running");
    (err as any).code = "WORKER_ALREADY_RUNNING";
    throw err;
  }

  try {
    return await fn();
  } finally {
    await releaseWorkerAdvisoryLock(lockKey);
  }
}
