"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toConvexId = toConvexId;
exports.isConvexId = isConvexId;
/**
 * Safely cast a string to a Convex ID type
 * @param id The string ID to cast
 * @returns The properly typed Convex ID
 */
function toConvexId(id) {
    return id;
}
/**
 * Check if a value is a valid Convex ID string
 * @param value The value to check
 * @returns True if the value looks like a Convex ID
 */
function isConvexId(value) {
    return typeof value === 'string' && value.length > 0;
}
