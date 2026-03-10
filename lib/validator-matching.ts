/**
 * Match validators in snapshot to registry by stable identifiers
 */

export function extractSecp(validator: any): string | undefined {
  if (validator.secp) {
    return validator.secp.toLowerCase();
  }
  return undefined;
}

/**
 * Try to find SECP key from validator object
 * Fallback: use node_id if available (less reliable but helps with older data)
 */
export function getValidatorSecp(validator: any): string | undefined {
  // Try direct secp field first
  if (validator.secp) {
    return validator.secp.toLowerCase();
  }

  // Fallback to node_id (less reliable)
  if (validator.node_id) {
    return validator.node_id.toLowerCase();
  }

  return undefined;
}
