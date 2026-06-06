export function validateJsonSchema(value, schema) {
  const errors = [];
  validateNode({ value, schema, path: "$", errors });
  return {
    ok: errors.length === 0,
    errors
  };
}

function validateNode({ value, schema, path, errors }) {
  if (!schema) return;

  if (schema.type && !matchesType(value, schema.type)) {
    errors.push(`${path} must be ${schema.type}`);
    return;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of: ${schema.enum.join(", ")}`);
  }

  if (schema.type === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path} length must be >= ${schema.minLength}`);
    }
    return;
  }

  if (schema.type === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path} must be >= ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path} must be <= ${schema.maximum}`);
    }
    return;
  }

  if (schema.type === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path} must have at least ${schema.minItems} item(s)`);
    }
    if (schema.items) {
      value.forEach((item, index) => validateNode({
        value: item,
        schema: schema.items,
        path: `${path}[${index}]`,
        errors
      }));
    }
    return;
  }

  if (schema.type === "object") {
    const required = schema.required ?? [];
    for (const key of required) {
      if (value[key] === undefined || value[key] === null) {
        errors.push(`${path}.${key} is required`);
      }
    }

    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (value[key] !== undefined && value[key] !== null) {
        validateNode({
          value: value[key],
          schema: childSchema,
          path: `${path}.${key}`,
          errors
        });
      }
    }
  }
}

function matchesType(value, type) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}
