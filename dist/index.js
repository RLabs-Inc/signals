var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __moduleCache = /* @__PURE__ */ new WeakMap;
var __toCommonJS = (from) => {
  var entry = __moduleCache.get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function")
    __getOwnPropNames(from).map((key) => !__hasOwnProp.call(entry, key) && __defProp(entry, key, {
      get: () => from[key],
      enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
    }));
  __moduleCache.set(from, entry);
  return entry;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};

// src/index.ts
var exports_src = {};
__export(exports_src, {
  watch: () => watch,
  untrack: () => untrack,
  toRaw: () => toRaw,
  state: () => state,
  signal: () => signal,
  shallowEquals: () => shallowEquals,
  readonly: () => readonly,
  reactiveArray: () => reactiveArray,
  peek: () => peek,
  isReactive: () => isReactive,
  effectScope: () => effectScope,
  effect: () => effect,
  derived: () => derived,
  defaultEquals: () => defaultEquals,
  batch: () => batch,
  ReactiveSet: () => ReactiveSet,
  ReactiveMap: () => ReactiveMap
});
module.exports = __toCommonJS(exports_src);
var activeReaction = null;
var reactionStack = [];
var batchDepth = 0;
var pendingReactions = new Set;
var untracking = false;
var proxyToSignal = new WeakMap;
var rawToProxy = new WeakMap;
var defaultEquals = (a, b) => Object.is(a, b);
var shallowEquals = (a, b) => {
  if (Object.is(a, b))
    return true;
  if (typeof a !== "object" || typeof b !== "object")
    return false;
  if (a === null || b === null)
    return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length)
    return false;
  for (const key of keysA) {
    if (!Object.is(a[key], b[key]))
      return false;
  }
  return true;
};
function signal(initial, options) {
  const internal = {
    v: initial,
    reactions: new Set,
    equals: options?.equals ?? defaultEquals
  };
  return {
    get value() {
      track(internal);
      return internal.v;
    },
    set value(newValue) {
      if (!internal.equals(internal.v, newValue)) {
        internal.v = newValue;
        trigger(internal);
      }
    }
  };
}
function effect(fn) {
  const reaction = {
    execute: () => {
      if (reaction.cleanup) {
        reaction.cleanup();
        reaction.cleanup = undefined;
      }
      for (const dep of reaction.deps) {
        dep.reactions.delete(reaction);
      }
      reaction.deps.clear();
      reactionStack.push(reaction);
      const prevReaction = activeReaction;
      activeReaction = reaction;
      try {
        const cleanup = fn();
        if (typeof cleanup === "function") {
          reaction.cleanup = cleanup;
        }
      } finally {
        activeReaction = prevReaction;
        reactionStack.pop();
      }
    },
    deps: new Set,
    active: true
  };
  reaction.execute();
  return () => {
    if (!reaction.active)
      return;
    reaction.active = false;
    if (reaction.cleanup) {
      reaction.cleanup();
    }
    for (const dep of reaction.deps) {
      dep.reactions.delete(reaction);
    }
    reaction.deps.clear();
  };
}
function derived(fn, options) {
  const internal = {
    v: undefined,
    reactions: new Set,
    equals: options?.equals ?? defaultEquals,
    fn,
    dirty: true
  };
  const deps = new Set;
  const markDirty = () => {
    if (!internal.dirty) {
      internal.dirty = true;
      trigger(internal);
    }
  };
  const recompute = () => {
    for (const dep of deps) {
      dep.reactions.delete(derivedReaction);
    }
    deps.clear();
    const prevReaction = activeReaction;
    activeReaction = derivedReaction;
    try {
      const newValue = fn();
      internal.v = newValue;
    } finally {
      activeReaction = prevReaction;
    }
    internal.dirty = false;
  };
  const derivedReaction = {
    execute: markDirty,
    deps,
    active: true
  };
  return {
    get value() {
      track(internal);
      if (internal.dirty) {
        recompute();
      }
      return internal.v;
    }
  };
}
derived.by = derived;
function batch(fn) {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      flushPending();
    }
  }
}
function untrack(fn) {
  const prev = untracking;
  untracking = true;
  try {
    return fn();
  } finally {
    untracking = prev;
  }
}
function track(signal2) {
  if (activeReaction && !untracking) {
    activeReaction.deps.add(signal2);
    signal2.reactions.add(activeReaction);
  }
}
function trigger(signal2) {
  const reactions = [...signal2.reactions];
  for (const reaction of reactions) {
    if (!reaction.active)
      continue;
    if ("dirty" in reaction) {
      reaction.dirty = true;
    }
    if (batchDepth > 0) {
      pendingReactions.add(reaction);
    } else {
      reaction.execute();
    }
  }
}
function flushPending() {
  const reactions = [...pendingReactions];
  pendingReactions.clear();
  for (const reaction of reactions) {
    if (reaction.active) {
      reaction.execute();
    }
  }
}
var REACTIVE_MARKER = Symbol("reactive");
function state(initial) {
  return createDeepReactive(initial);
}
function shouldProxy(value) {
  if (value === null || typeof value !== "object")
    return false;
  if (value[REACTIVE_MARKER])
    return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === Array.prototype || proto === null;
}
function createDeepReactive(target) {
  const existing = rawToProxy.get(target);
  if (existing)
    return existing;
  const internal = {
    v: target,
    reactions: new Set,
    equals: defaultEquals
  };
  const propSignals = new Map;
  const getPropSignal = (prop) => {
    let sig = propSignals.get(prop);
    if (!sig) {
      sig = {
        v: target[prop],
        reactions: new Set,
        equals: defaultEquals
      };
      propSignals.set(prop, sig);
    }
    return sig;
  };
  const proxy = new Proxy(target, {
    get(target2, prop, receiver) {
      if (prop === REACTIVE_MARKER)
        return true;
      const value = Reflect.get(target2, prop, receiver);
      if (Array.isArray(target2) && typeof value === "function") {
        track(internal);
        return value.bind(proxy);
      }
      const sig = getPropSignal(prop);
      track(sig);
      if (shouldProxy(value)) {
        const existingProxy = rawToProxy.get(value);
        if (existingProxy)
          return existingProxy;
        return createDeepReactive(value);
      }
      return value;
    },
    set(target2, prop, value, receiver) {
      const oldValue = target2[prop];
      const rawValue = value?.[REACTIVE_MARKER] ? proxyToRaw.get(value) ?? value : value;
      if (Object.is(oldValue, rawValue))
        return true;
      const result = Reflect.set(target2, prop, rawValue, receiver);
      if (result) {
        const sig = getPropSignal(prop);
        sig.v = rawValue;
        trigger(sig);
        if (Array.isArray(target2)) {
          internal.v = target2;
          trigger(internal);
        }
      }
      return result;
    },
    deleteProperty(target2, prop) {
      const hadKey = prop in target2;
      const result = Reflect.deleteProperty(target2, prop);
      if (result && hadKey) {
        const sig = propSignals.get(prop);
        if (sig) {
          sig.v = undefined;
          trigger(sig);
        }
        trigger(internal);
      }
      return result;
    },
    has(target2, prop) {
      if (prop === REACTIVE_MARKER)
        return true;
      track(internal);
      return Reflect.has(target2, prop);
    },
    ownKeys(target2) {
      track(internal);
      return Reflect.ownKeys(target2);
    }
  });
  rawToProxy.set(target, proxy);
  proxyToRaw.set(proxy, target);
  proxyToSignal.set(proxy, internal);
  return proxy;
}
var proxyToRaw = new WeakMap;
function toRaw(proxy) {
  if (proxy && typeof proxy === "object" && proxy[REACTIVE_MARKER]) {
    return proxyToRaw.get(proxy) ?? proxy;
  }
  return proxy;
}
function isReactive(value) {
  return value !== null && typeof value === "object" && value[REACTIVE_MARKER] === true;
}

class ReactiveMap extends Map {
  #keySignals = new Map;
  #version = { v: 0, reactions: new Set, equals: defaultEquals };
  #size = { v: 0, reactions: new Set, equals: defaultEquals };
  constructor(entries) {
    super();
    if (entries) {
      for (const [key, value] of entries) {
        super.set(key, value);
      }
      this.#size.v = super.size;
    }
  }
  #getKeySignal(key) {
    let sig = this.#keySignals.get(key);
    if (!sig) {
      sig = { v: 0, reactions: new Set, equals: defaultEquals };
      this.#keySignals.set(key, sig);
    }
    return sig;
  }
  get size() {
    track(this.#size);
    return super.size;
  }
  has(key) {
    const sig = this.#getKeySignal(key);
    track(sig);
    return super.has(key);
  }
  get(key) {
    const sig = this.#getKeySignal(key);
    track(sig);
    return super.get(key);
  }
  set(key, value) {
    const isNew = !super.has(key);
    const oldValue = super.get(key);
    super.set(key, value);
    const sig = this.#getKeySignal(key);
    if (isNew) {
      this.#size.v = super.size;
      trigger(this.#size);
      this.#version.v++;
      trigger(this.#version);
      sig.v++;
      trigger(sig);
    } else if (!Object.is(oldValue, value)) {
      sig.v++;
      trigger(sig);
    }
    return this;
  }
  delete(key) {
    const had = super.has(key);
    const result = super.delete(key);
    if (had) {
      const sig = this.#keySignals.get(key);
      if (sig) {
        sig.v = -1;
        trigger(sig);
        this.#keySignals.delete(key);
      }
      this.#size.v = super.size;
      trigger(this.#size);
      this.#version.v++;
      trigger(this.#version);
    }
    return result;
  }
  clear() {
    if (super.size === 0)
      return;
    for (const sig of this.#keySignals.values()) {
      sig.v = -1;
      trigger(sig);
    }
    super.clear();
    this.#keySignals.clear();
    this.#size.v = 0;
    trigger(this.#size);
    this.#version.v++;
    trigger(this.#version);
  }
  forEach(callbackfn, thisArg) {
    track(this.#version);
    super.forEach(callbackfn, thisArg);
  }
  keys() {
    track(this.#version);
    return super.keys();
  }
  values() {
    track(this.#version);
    return super.values();
  }
  entries() {
    track(this.#version);
    return super.entries();
  }
  [Symbol.iterator]() {
    return this.entries();
  }
}

class ReactiveSet extends Set {
  #itemSignals = new Map;
  #version = { v: 0, reactions: new Set, equals: defaultEquals };
  #size = { v: 0, reactions: new Set, equals: defaultEquals };
  constructor(values) {
    super();
    if (values) {
      for (const value of values) {
        super.add(value);
      }
      this.#size.v = super.size;
    }
  }
  #getItemSignal(item) {
    let sig = this.#itemSignals.get(item);
    if (!sig) {
      sig = { v: super.has(item), reactions: new Set, equals: defaultEquals };
      this.#itemSignals.set(item, sig);
    }
    return sig;
  }
  get size() {
    track(this.#size);
    return super.size;
  }
  has(value) {
    const sig = this.#getItemSignal(value);
    track(sig);
    return super.has(value);
  }
  add(value) {
    if (!super.has(value)) {
      super.add(value);
      const sig = this.#getItemSignal(value);
      sig.v = true;
      trigger(sig);
      this.#size.v = super.size;
      trigger(this.#size);
      this.#version.v++;
      trigger(this.#version);
    }
    return this;
  }
  delete(value) {
    const had = super.has(value);
    const result = super.delete(value);
    if (had) {
      const sig = this.#itemSignals.get(value);
      if (sig) {
        sig.v = false;
        trigger(sig);
        this.#itemSignals.delete(value);
      }
      this.#size.v = super.size;
      trigger(this.#size);
      this.#version.v++;
      trigger(this.#version);
    }
    return result;
  }
  clear() {
    if (super.size === 0)
      return;
    for (const sig of this.#itemSignals.values()) {
      sig.v = false;
      trigger(sig);
    }
    super.clear();
    this.#itemSignals.clear();
    this.#size.v = 0;
    trigger(this.#size);
    this.#version.v++;
    trigger(this.#version);
  }
  forEach(callbackfn, thisArg) {
    track(this.#version);
    super.forEach(callbackfn, thisArg);
  }
  keys() {
    track(this.#version);
    return super.keys();
  }
  values() {
    track(this.#version);
    return super.values();
  }
  entries() {
    track(this.#version);
    return super.entries();
  }
  [Symbol.iterator]() {
    return this.values();
  }
}
function reactiveArray(initial = []) {
  const internal = {
    v: 0,
    reactions: new Set,
    equals: defaultEquals
  };
  const indexSignals = new Map;
  const lengthSignal = {
    v: initial.length,
    reactions: new Set,
    equals: defaultEquals
  };
  const getIndexSignal = (index) => {
    let sig = indexSignals.get(index);
    if (!sig) {
      sig = { v: initial[index], reactions: new Set, equals: defaultEquals };
      indexSignals.set(index, sig);
    }
    return sig;
  };
  const array = [...initial];
  const proxy = new Proxy(array, {
    get(target, prop, receiver) {
      if (prop === "length") {
        track(lengthSignal);
        return target.length;
      }
      const index = typeof prop === "string" ? parseInt(prop, 10) : NaN;
      if (!isNaN(index)) {
        const sig = getIndexSignal(index);
        track(sig);
        return target[index];
      }
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return function(...args) {
          const method = prop;
          if (["indexOf", "includes", "find", "findIndex", "some", "every", "forEach", "map", "filter", "reduce", "reduceRight", "join", "toString"].includes(method)) {
            track(internal);
            return value.apply(target, args);
          }
          const prevLength = target.length;
          const result = value.apply(target, args);
          const newLength = target.length;
          if (newLength !== prevLength) {
            lengthSignal.v = newLength;
            trigger(lengthSignal);
          }
          if (["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin"].includes(method)) {
            internal.v++;
            trigger(internal);
            for (let i = 0;i < Math.max(prevLength, newLength); i++) {
              const sig = indexSignals.get(i);
              if (sig && !Object.is(sig.v, target[i])) {
                sig.v = target[i];
                trigger(sig);
              }
            }
          }
          return result;
        };
      }
      return value;
    },
    set(target, prop, value, receiver) {
      if (prop === "length") {
        const oldLength = target.length;
        target.length = value;
        if (oldLength !== value) {
          lengthSignal.v = value;
          trigger(lengthSignal);
          internal.v++;
          trigger(internal);
        }
        return true;
      }
      const index = typeof prop === "string" ? parseInt(prop, 10) : NaN;
      if (!isNaN(index)) {
        const oldValue = target[index];
        if (!Object.is(oldValue, value)) {
          target[index] = value;
          const sig = getIndexSignal(index);
          sig.v = value;
          trigger(sig);
          if (index >= lengthSignal.v) {
            lengthSignal.v = target.length;
            trigger(lengthSignal);
          }
          internal.v++;
          trigger(internal);
        }
        return true;
      }
      return Reflect.set(target, prop, value, receiver);
    }
  });
  return proxy;
}
function effectScope() {
  const disposers = [];
  let active = true;
  return {
    run(fn) {
      if (!active)
        return;
      const originalEffect = effect;
      globalThis.__signalEffect = effect;
      const wrappedEffect = (effectFn) => {
        const dispose = originalEffect(effectFn);
        disposers.push(dispose);
        return dispose;
      };
      const prevEffect = globalThis.__effectOverride;
      globalThis.__effectOverride = wrappedEffect;
      try {
        return fn();
      } finally {
        globalThis.__effectOverride = prevEffect;
      }
    },
    stop() {
      if (!active)
        return;
      active = false;
      for (const dispose of disposers) {
        dispose();
      }
      disposers.length = 0;
    },
    get active() {
      return active;
    }
  };
}
function watch(source, callback, options) {
  let oldValue;
  let cleanup;
  let first = true;
  return effect(() => {
    const newValue = source();
    if (first) {
      first = false;
      oldValue = newValue;
      if (options?.immediate) {
        cleanup = callback(newValue, undefined);
      }
      return;
    }
    if (!Object.is(newValue, oldValue)) {
      if (typeof cleanup === "function") {
        cleanup();
      }
      cleanup = callback(newValue, oldValue);
      oldValue = newValue;
    }
  });
}
function readonly(sig) {
  return {
    get value() {
      return sig.value;
    }
  };
}
function peek(fn) {
  return untrack(fn);
}
