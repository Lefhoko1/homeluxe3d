/**
 * The admin module.
 *
 * Everything that lets an operator change what is in the house: uploading a
 * model, saying which shop it belongs to and where it may stand, then placing
 * it, moving it and publishing it.
 *
 * It is a separate directory rather than more props on the existing
 * components because the visitor's showroom must not depend on any of it.
 * `AdminGate` renders nothing at all when the caller cannot administer, so a
 * visitor never mounts a single one of these.
 */

export { default as AdminGate } from './AdminGate';
export { default as AdminBar } from './AdminBar';
export { default as AdminList } from './AdminList';
export { default as UploadDialog } from './UploadDialog';
export { PlacementEditor } from './PlacementEditor';
export { useAdmin } from './useAdmin';
