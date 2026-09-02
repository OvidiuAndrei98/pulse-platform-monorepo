const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const sourceRoot = path.resolve(__dirname, "../src");
const resourceFile = path.join(sourceRoot, "i18n", "resources.ts");
const files = [];
const findings = [];
const translationReferences = [];

const userFacingProperties = new Set([
  "alt",
  "aria-label",
  "aria-roledescription",
  "cancelLabel",
  "confirmLabel",
  "description",
  "emptyMessage",
  "hint",
  "label",
  "message",
  "placeholder",
  "subtitle",
  "title",
]);

const allowedLiterals = new Set(["SPOTTR", "RON", "EUR", "USD", "CTR", "US"]);

function collectFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(filePath);
    else if (/\.tsx?$/.test(entry.name) && filePath !== resourceFile) files.push(filePath);
  }
}

function normalizedPropertyName(name, sourceFile) {
  return name.getText(sourceFile).replace(/^['"]|['"]$/g, "");
}

function isTranslatable(value) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || allowedLiterals.has(text) || /^SPOTTR\b/.test(text)) return false;
  if (/^(?:https?:\/\/|mailto:|tel:|\/)/i.test(text)) return false;
  if (/[{}][\s\S]*[;:]/.test(text)) return false;
  if (/^[A-Z0-9_.:/@+-]+$/.test(text)) return false;
  if (/^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+$/.test(text)) return false;
  return /[A-Za-zĂÂÎȘȚăâîșț]{2}/.test(text);
}

function addFinding(sourceFile, node, kind, value) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!isTranslatable(text)) return;
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  findings.push({
    file: path.relative(sourceRoot, sourceFile.fileName),
    line: position.line + 1,
    kind,
    text,
  });
}

function literalValue(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : undefined;
}

function auditFile(filePath) {
  const contents = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    contents,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node) {
    if (ts.isJsxText(node)) {
      addFinding(sourceFile, node, "JSX text", node.getText(sourceFile));
    }

    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = normalizedPropertyName(node.name, sourceFile);
      if (userFacingProperties.has(name)) {
        addFinding(sourceFile, node, `JSX ${name}`, node.initializer.text);
      }
    }

    if (ts.isJsxExpression(node) && node.expression) {
      const value = literalValue(node.expression);
      if (value !== undefined) addFinding(sourceFile, node, "JSX expression", value);
    }

    if (ts.isPropertyAssignment(node)) {
      const name = normalizedPropertyName(node.name, sourceFile);
      const value = literalValue(node.initializer);
      if (userFacingProperties.has(name) && value !== undefined) {
        addFinding(sourceFile, node, `property ${name}`, value);
      }
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sourceFile);
      const value = node.arguments[0] && literalValue(node.arguments[0]);
      if ((callee === "t" || callee === "i18n.t") && value !== undefined) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        translationReferences.push({
          file: path.relative(sourceRoot, sourceFile.fileName),
          line: position.line + 1,
          key: value,
        });
      }
      if (
        value !== undefined &&
        !callee.startsWith("console.") &&
        /(?:^|\.)(?:error|info|success|warning)$|setError$|setMessage$|Error$|alert$/.test(callee)
      ) {
        addFinding(sourceFile, node, `call ${callee}`, value);
      }
    }

    if (ts.isNewExpression(node) && node.expression.getText(sourceFile) === "Error") {
      const value = node.arguments?.[0] && literalValue(node.arguments[0]);
      if (value !== undefined) addFinding(sourceFile, node, "new Error", value);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

collectFiles(sourceRoot);
files.forEach(auditFile);

function loadResources() {
  const source = fs.readFileSync(resourceFile, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const moduleShim = { exports: {} };
  Function("module", "exports", "require", compiled)(moduleShim, moduleShim.exports, require);
  return moduleShim.exports.resources;
}

function collectResourcePaths(value, prefix = "", paths = new Set()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) paths.add(prefix);
    return paths;
  }
  if (prefix) paths.add(prefix);
  for (const [key, child] of Object.entries(value)) {
    collectResourcePaths(child, prefix ? `${prefix}.${key}` : key, paths);
  }
  return paths;
}

function hasResourcePath(resource, key) {
  const segments = key.split(".");
  let current = resource;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      const finalSegment = segments.at(-1);
      const parentSegments = segments.slice(0, -1);
      let parent = resource;
      for (const parentSegment of parentSegments) parent = parent?.[parentSegment];
      return Boolean(
        parent &&
        typeof parent === "object" &&
        (`${finalSegment}_one` in parent || `${finalSegment}_other` in parent),
      );
    }
    current = current[segment];
  }
  return true;
}

const resources = loadResources();
const english = resources.en.translation;
const romanian = resources.ro.translation;
const englishPaths = collectResourcePaths(english);
const romanianPaths = collectResourcePaths(romanian);
const resourceErrors = [];

for (const pathName of englishPaths) {
  if (!romanianPaths.has(pathName)) resourceErrors.push(`Missing Romanian resource: ${pathName}`);
}
for (const pathName of romanianPaths) {
  if (!englishPaths.has(pathName)) resourceErrors.push(`Missing English resource: ${pathName}`);
}
for (const reference of translationReferences) {
  if (!hasResourcePath(english, reference.key)) {
    resourceErrors.push(`${reference.file}:${reference.line} Missing English key: ${reference.key}`);
  }
  if (!hasResourcePath(romanian, reference.key)) {
    resourceErrors.push(`${reference.file}:${reference.line} Missing Romanian key: ${reference.key}`);
  }
}

for (const finding of findings) {
  console.log(`${finding.file}:${finding.line} [${finding.kind}] ${finding.text}`);
}
for (const error of resourceErrors) console.error(error);

if (findings.length > 0 || resourceErrors.length > 0) {
  console.error(`\nFound ${findings.length} potentially hardcoded user-facing strings.`);
  console.error(`Found ${resourceErrors.length} translation resource errors.`);
  process.exitCode = 1;
} else {
  console.log("No hardcoded user-facing strings or translation resource errors found by the AST audit.");
}
