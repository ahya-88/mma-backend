class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
    this.status = 400;
    this.details = details;
  }
}

function validateField(value, rules = {}, fieldName = "Field") {
  const { required, type, min, max, enum: allowedValues, pattern, custom } = rules;

  if (required && (value === undefined || value === null || (typeof value === "string" && !value.trim()))) {
    return `${fieldName} wajib diisi.`;
  }

  if (value !== undefined && value !== null) {
    if (type === "string" && typeof value !== "string") {
      return `${fieldName} harus berupa teks.`;
    }
    if (type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
      return `${fieldName} harus berupa angka.`;
    }
    if (type === "boolean" && typeof value !== "boolean") {
      return `${fieldName} harus berupa boolean.`;
    }
    if (type === "array" && !Array.isArray(value)) {
      return `${fieldName} harus berupa array.`;
    }
    if (type === "object" && (typeof value !== "object" || Array.isArray(value) || value === null)) {
      return `${fieldName} harus berupa objek.`;
    }

    if (typeof value === "string") {
      if (min !== undefined && value.trim().length < min) {
        return `${fieldName} minimal ${min} karakter.`;
      }
      if (max !== undefined && value.trim().length > max) {
        return `${fieldName} maksimal ${max} karakter.`;
      }
      if (pattern && !pattern.test(value)) {
        return `Format ${fieldName} tidak valid.`;
      }
    }

    if (typeof value === "number") {
      if (min !== undefined && value < min) {
        return `${fieldName} minimal ${min}.`;
      }
      if (max !== undefined && value > max) {
        return `${fieldName} maksimal ${max}.`;
      }
    }

    if (allowedValues && !allowedValues.includes(value)) {
      return `Nilai ${fieldName} harus salah satu dari: ${allowedValues.join(", ")}.`;
    }

    if (custom && typeof custom === "function") {
      const customErr = custom(value);
      if (customErr) return customErr;
    }
  }

  return null;
}

function validateSchema(data = {}, schema = {}) {
  const errors = [];
  for (const [fieldName, rules] of Object.entries(schema)) {
    const value = data[fieldName];
    const err = validateField(value, rules, rules.label || fieldName);
    if (err) errors.push({ field: fieldName, message: err });
  }
  return errors;
}

function validateBody(schema) {
  return (req, res, next) => {
    const errors = validateSchema(req.body || {}, schema);
    if (errors.length > 0) {
      return res.status(400).json({
        error: errors[0].message,
        details: errors,
      });
    }
    next();
  };
}

module.exports = {
  ValidationError,
  validateField,
  validateSchema,
  validateBody,
};
