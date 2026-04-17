import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../extension/dark-mode.js", import.meta.url), "utf8");

const documentElement = {
  attributes: {},
  setAttribute(name, value) {
    this.attributes[name] = value;
  },
  removeAttribute(name) {
    delete this.attributes[name];
  },
  getAttribute(name) {
    return this.attributes[name];
  },
  appendChild() {}
};

const document = {
  readyState: "complete",
  documentElement,
  head: documentElement,
  body: { nodeType: 1 },
  createElement(tag) {
    return {
      tag,
      id: "",
      textContent: "",
      remove() {}
    };
  },
  getElementById() {
    return null;
  },
  querySelectorAll() {
    return [];
  },
  addEventListener() {}
};

const context = {
  window: null,
  document,
  Node: { ELEMENT_NODE: 1 },
  MutationObserver: class {
    observe() {}
  },
  chrome: {
    storage: {
      sync: {
        get(_keys, callback) {
          callback({});
        }
      },
      onChanged: {
        addListener() {}
      }
    }
  },
  location: {
    hostname: "example.com"
  },
  getComputedStyle() {
    return { backgroundColor: "rgb(255, 255, 255)" };
  }
};
context.window = context;
context.globalThis = context;

vm.createContext(context);
vm.runInContext(source, context);

const api = context.DefaultDarkModePoc;

assert.equal(api.isEnabledForHost({ globalEnabled: true, disabledHosts: {} }, "example.com"), true);
assert.equal(api.isEnabledForHost({ globalEnabled: true, disabledHosts: { "example.com": true } }, "example.com"), false);
assert.equal(api.isEnabledForHost({ globalEnabled: false, disabledHosts: {} }, "example.com"), false);
assert.equal(api.looksLight("rgb(255, 255, 255)"), true);
assert.equal(api.looksLight("rgb(16, 20, 24)"), false);
assert.equal(api.normalizeState({}).globalEnabled, true);
assert.deepEqual(Object.keys(api.normalizeState({ disabledHosts: null }).disabledHosts), []);

console.log("dark-mode engine tests passed");
