import { z } from 'zod';

/**
 * Simple converter from zod schema to JSON Schema (subset).
 * Supports basic types: string, number, boolean, object, array, optional.
 */
export function zodToJsonSchema(schema: z.ZodSchema): Record<string, any> {
  if (schema instanceof z.ZodString) {
    return { type: 'string' };
  }
  if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  }
  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }
  if (schema instanceof z.ZodArray) {
    const elementSchema = schema.element;
    return { type: 'array', items: zodToJsonSchema(elementSchema) };
  }
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    const shape = schema.shape;

    for (const [key, fieldSchema] of Object.entries(shape)) {
      const fs = fieldSchema as z.ZodSchema;
      if (fs instanceof z.ZodOptional || fs instanceof z.ZodNullable) {
        properties[key] = zodToJsonSchema((fs as any).unwrap?.() ?? fs);
      } else {
        properties[key] = zodToJsonSchema(fs);
        required.push(key);
      }
    }
    return { type: 'object', properties, required };
  }
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema((schema as any).unwrap?.() ?? schema);
  }
  if (schema instanceof z.ZodUnion) {
    const options = (schema as any).options || [];
    return { oneOf: options.map((s: z.ZodSchema) => zodToJsonSchema(s)) };
  }
  // Default fallback
  return { type: 'object' };
}
