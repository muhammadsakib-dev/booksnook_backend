import { ObjectId } from "mongodb";

/**
 * Validates if a string is a valid 24-character hexadecimal ObjectId
 */
export function isValidObjectId(id) {
  if (!id || typeof id !== "string") return false;
  return /^[0-9a-fA-F]{24}$/.test(id) && ObjectId.isValid(id);
}

/**
 * Normalizes book query filter to match either native ObjectId or legacy string _id
 */
export function getBookQuery(id) {
  if (!id) return { _id: null };
  const strId = String(id);
  if (isValidObjectId(strId)) {
    return { $or: [{ _id: new ObjectId(strId) }, { _id: strId }] };
  }
  return { _id: strId };
}

/**
 * Normalizes borrow record query filter to match either native ObjectId or legacy string _id
 */
export function getBorrowQuery(id) {
  if (!id) return { _id: null };
  const strId = String(id);
  if (isValidObjectId(strId)) {
    return { $or: [{ _id: new ObjectId(strId) }, { _id: strId }] };
  }
  return { _id: strId };
}

