import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getProductBySlug = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { resolveProductBySlug } = await import("./catalog.server");
    return resolveProductBySlug(data.slug);
  });
