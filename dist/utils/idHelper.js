import { ObjectId } from "mongodb";
export function isValidObjectId(id) {
    if (!id || typeof id !== "string")
        return false;
    return /^[0-9a-fA-F]{24}$/.test(id) && ObjectId.isValid(id);
}
export function getBookQuery(id) {
    if (!id)
        return { _id: null };
    const strId = String(id);
    if (isValidObjectId(strId)) {
        return { $or: [{ _id: new ObjectId(strId) }, { _id: strId }] };
    }
    return { _id: strId };
}
export function getBorrowQuery(id) {
    if (!id)
        return { _id: null };
    const strId = String(id);
    if (isValidObjectId(strId)) {
        return { $or: [{ _id: new ObjectId(strId) }, { _id: strId }] };
    }
    return { _id: strId };
}
