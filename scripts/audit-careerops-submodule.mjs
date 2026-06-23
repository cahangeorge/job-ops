#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const submodulePath = path.join(root, "vendor", "career-ops");
const registryPath = path.join(
  root,
  "orchestrator",
  "src",
  "shared",
  "career-ops",
  "feature-registry.ts",
);

const expectedSourceAreas = [
  "job-fit-analysis",
  "apply-mode",
  "offer-mode",
  "portal-scanner",
  "pipeline-tracking",
  "offer-evaluation",
  "cv-generation",
  "interview-prep",
  "liveness",
  "follow-ups",
  "analytics",
  "batch",
  "onboarding",
];

function fail(message) {
  console.error(`CareerOps audit failed: ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(submodulePath)) {
  fail("vendor/career-ops is missing. Run git submodule update --init --recursive.");
  process.exit();
}

if (!fs.existsSync(path.join(submodulePath, ".git"))) {
  fail("vendor/career-ops is not initialized as a git submodule.");
}

if (!fs.existsSync(registryPath)) {
  fail("CareerOps feature registry is missing.");
  process.exit();
}

const registry = fs.readFileSync(registryPath, "utf8");

for (const sourceArea of expectedSourceAreas) {
  if (!registry.includes(`sourceArea: "${sourceArea}"`)) {
    fail(`registry does not mention source area ${sourceArea}`);
  }
}

if (process.exitCode) {
  process.exit();
}

console.log(
  "CareerOps audit passed: submodule exists and registry covers expected source areas.",
);
