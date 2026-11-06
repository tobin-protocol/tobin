'use strict';
// The SHA-256 of the reviewed deployment-config.json (the approved admin F, salt and predicted contract ID).
// It is null until a person has reviewed that file; while it is null the signer can PREVIEW but refuses to EXECUTE.
// Changing this value, or the file it pins, is a code/config change that must itself be reviewed.
module.exports = { PINNED_CONFIG_SHA256: null };
