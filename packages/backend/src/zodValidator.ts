import { FastifyInstance } from "fastify";
import { ZodSchema } from "zod";

export function setupZodValidation(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(({ schema }) => {
    if (!schema || typeof (schema as any).safeParse !== "function") {
      return (data: unknown) => data;
    }
    const zodSchema = schema as ZodSchema;
    return (data: unknown) => {
      const result = zodSchema.safeParse(data);
      if (result.success) {
        return result.data;
      }
      const error: any = new Error("Validation failed");
      error.statusCode = 400;
      error.validation = result.error.issues;
      return error;
    };
  });
}
