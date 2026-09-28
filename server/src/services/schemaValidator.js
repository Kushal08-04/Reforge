const Joi = require("joi");

/**
 * schemaValidator
 * ----------------
 * Conventional / structural validation layer (Section 4, step 4 of the
 * handoff doc). This runs BEFORE semantic validation and checks only:
 * required fields, types, and basic format - nothing contextual.
 *
 * Deliberately generic: REFORGE ingests arbitrary sensor payloads, so the
 * schema only enforces the envelope shape. Per-field range checks are
 * layered on top for the primary numeric "value" field, since that's the
 * field the semantic engine reasons about.
 */
const observationEnvelopeSchema = Joi.object({
  sourceId: Joi.string().min(1).required(),
  sourceType: Joi.string()
    .valid("sensor", "api", "file", "database", "manual", "other")
    .default("sensor"),
  entityId: Joi.string().min(1).required(),
  timestamp: Joi.alternatives()
    .try(Joi.date().iso(), Joi.date())
    .required(),
  values: Joi.object({
    value: Joi.number().required(),
  })
    .unknown(true) // allow extra fields (humidity, pressure, etc.) without rejecting
    .required(),
  units: Joi.object().unknown(true).default({}),
}).unknown(false);

/**
 * Validates the structural shape of a single incoming observation.
 * Returns { valid: boolean, errors: string[] }
 */
function validateSchema(payload) {
  const { error } = observationEnvelopeSchema.validate(payload, {
    abortEarly: false,
  });

  if (!error) {
    return { valid: true, errors: [] };
  }

  const errors = error.details.map((d) => d.message);
  return { valid: false, errors };
}

module.exports = { validateSchema, observationEnvelopeSchema };
