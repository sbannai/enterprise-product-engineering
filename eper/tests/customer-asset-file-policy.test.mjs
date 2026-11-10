import test from "node:test";
import assert from "node:assert/strict";
import { validateCustomerAssetUploadPolicy } from "../dist/packages/assets/customer-asset-file-policy.js";

const policy = JSON.stringify({ files: [
  { extension: ".png", mimeType: "image/png", maxSizeBytes: 1024 },
  { extension: ".mp4", mimeType: "video/mp4", maxSizeBytes: 4096 },
  { extension: ".docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", maxSizeBytes: 2048 },
  { extension: ".pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", maxSizeBytes: 2048 },
  { extension: ".xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", maxSizeBytes: 2048 },
] });

test("configured policy permits exact extension/MIME pairs within configured limits", () => {
  assert.doesNotThrow(() => validateCustomerAssetUploadPolicy({
    fileName: "plan.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 2048,
  }, policy));
});

test("missing or malformed policy fails closed", () => {
  assert.throws(() => validateCustomerAssetUploadPolicy({ fileName: "a.png", mimeType: "image/png", sizeBytes: 1 }, undefined), /FILE_POLICY_UNAVAILABLE/);
  assert.throws(() => validateCustomerAssetUploadPolicy({ fileName: "a.png", mimeType: "image/png", sizeBytes: 1 }, "{"), /FILE_POLICY_INVALID/);
});

test("extension and MIME mismatch is rejected", () => {
  assert.throws(() => validateCustomerAssetUploadPolicy({ fileName: "a.png", mimeType: "image/jpeg", sizeBytes: 1 }, policy), /FILE_TYPE_NOT_ALLOWED/);
});

test("unconfigured extension and excessive size are rejected", () => {
  assert.throws(() => validateCustomerAssetUploadPolicy({ fileName: "a.svg", mimeType: "image/svg+xml", sizeBytes: 1 }, policy), /FILE_TYPE_NOT_ALLOWED/);
  assert.throws(() => validateCustomerAssetUploadPolicy({ fileName: "a.png", mimeType: "image/png", sizeBytes: 1025 }, policy), /FILE_SIZE_EXCEEDED/);
});

test("path-like, hidden, traversal and non-normalized filenames are rejected", () => {
  for (const fileName of ["../a.png", "folder/a.png", "a\\b.png", ".a.png", "a..png", "a\u0000.png", "e\u0301.png"]) {
    assert.throws(() => validateCustomerAssetUploadPolicy({ fileName, mimeType: "image/png", sizeBytes: 1 }, policy), /FILE_NAME_INVALID/);
  }
});

test("ambiguous policy entries fail closed", () => {
  const ambiguous = JSON.stringify({ files: [
    { extension: ".png", mimeType: "image/png", maxSizeBytes: 10 },
    { extension: ".PNG", mimeType: "image/x-png", maxSizeBytes: 10 },
  ] });
  assert.throws(() => validateCustomerAssetUploadPolicy({ fileName: "a.png", mimeType: "image/png", sizeBytes: 1 }, ambiguous), /FILE_POLICY_AMBIGUOUS/);
});
