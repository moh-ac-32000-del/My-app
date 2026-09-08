"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapPrimarySpace = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const bootstrapPrimarySpace_js_1 = require("./bootstrapPrimarySpace.js");
(0, app_1.initializeApp)();
const firestore = (0, firestore_1.getFirestore)();
const runtime = (0, bootstrapPrimarySpace_js_1.createDefaultBootstrapRuntime)(firestore);
exports.bootstrapPrimarySpace = (0, https_1.onCall)(async (request) => ((0, bootstrapPrimarySpace_js_1.bootstrapPrimarySpaceHandler)(request, runtime)));
//# sourceMappingURL=index.js.map