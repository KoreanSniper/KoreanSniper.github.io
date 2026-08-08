// Shared Firebase entry point.
// Keep Firebase initialization here instead of inside feature folders.
// This file is intentionally minimal during the migration so existing
// community code can be moved to core incrementally.
export { app, auth, db } from "../../../community/js/firebase.js";
