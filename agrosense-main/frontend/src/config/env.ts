import { z } from "zod";

const envSchema = z.object({
  VITE_API_URL: z.string().url().default("http://localhost:4000/api/v1"),
  VITE_SOCKET_URL: z.string().url().default("http://localhost:4000"),
});

function parseEnv() {
  const parsed = envSchema.safeParse({
    VITE_API_URL: import.meta.env.VITE_API_URL,
    VITE_SOCKET_URL: import.meta.env.VITE_SOCKET_URL,
  });

  if (!parsed.success) {
    console.warn("[AgroSense] Invalid frontend env, falling back to localhost:", parsed.error.flatten());
    return envSchema.parse({});
  }
  return parsed.data;
}

export const env = parseEnv();
